import * as THREE from 'three';
import { EditorComponentMode } from '@/types/editor_component_mode.js';
import type { HandlerComponentTopologyDependencies } from './handler_component_topology.js';
import { commitTopologyWorkingMutation, loadWorkingGeometryFromTarget } from './topology_commit.js';
import { extrudeTopologyWorkingFaces, type TopologyFaceExtrudeGrouping } from './topology_face_extrude.js';
import { collectTopologyFaceRegions } from './topology_face_region.js';
import { insetTopologyWorkingFaceRegions, type TopologyFaceInsetGrouping } from './topology_face_inset_region.js';
import type { TopologyOperatorResult } from './topology_operator_result.js';
import { collectSelectedFaceIndices, collectSelectionTargetIds } from './topology_selection_vertices.js';
import { findEditDomainTargetById, resolveTopologyEditTarget } from './topology_target_resolve.js';
import type { TopologyMeshTarget } from './topology_target.js';
import type { TopologyWorkingGeometry } from './topology_working_geometry.js';

/** Centre and averaged normal of the selected faces, used by drag tools. */
export interface FaceSelectionAxis {
  /** Centre of the selected faces in world space. */
  anchor: THREE.Vector3;
  /** Unit world direction a positive distance moves the faces. */
  direction: THREE.Vector3;
}

/** Selected faces of one edited mesh. */
interface MeshFaceSelection {
  /** Live mesh target. */
  target: TopologyMeshTarget;
  /** Selected face indices. */
  faces: number[];
}

/**
 * Runs mesh modelling operations (extrude, inset and friends) on the Edit Mode
 * selection. Brushes are left alone: these operations add faces a convex brush
 * cannot hold.
 */
export class HandlerComponentMeshOperations {
  private readonly deps: HandlerComponentTopologyDependencies;

  /**
   * Creates the handler.
   *
   * @param deps Session, undo, and presentation callbacks.
   */
  constructor(deps: HandlerComponentTopologyDependencies) {
    this.deps = deps;
  }

  /**
   * Returns the centre and drag axis of the selected faces.
   *
   * @param toolLabel Tool name used in status messages.
   * @returns Axis, or null when no mesh faces are selected in Face mode.
   */
  describeFaceSelectionAxis(toolLabel: string): FaceSelectionAxis | null {
    const selections = this.collectMeshFaceSelections(toolLabel);
    if (selections.length === 0) return null;
    const direction = new THREE.Vector3();
    const anchor = new THREE.Vector3();
    let cornerCount = 0;
    for (const { target, faces } of selections) {
      const geometry = loadWorkingGeometryFromTarget(target);
      direction.add(meshFaceSelectionWorldDirection(target, geometry, faces));
      cornerCount += addFaceCornersToWorldSum(target, geometry, faces, anchor);
    }
    if (direction.lengthSq() < 1e-20) direction.copy(firstRegionWorldDirection(selections[0]!));
    return { anchor: anchor.divideScalar(Math.max(1, cornerCount)), direction: direction.normalize() };
  }

  /**
   * Builds world line segments of the faces an extrusion would create, without
   * touching the scene.
   *
   * @param distance Signed world distance.
   * @param grouping Region or individual grouping.
   * @returns Flat list of segment endpoints, two points per segment.
   */
  previewFaceExtrude(distance: number, grouping: TopologyFaceExtrudeGrouping): THREE.Vector3[] {
    const points: THREE.Vector3[] = [];
    for (const { target, faces } of this.collectMeshFaceSelections('Extrude Faces')) {
      const geometry = loadWorkingGeometryFromTarget(target);
      const firstWall = geometry.faces.length;
      const result = extrudeTopologyWorkingFaces(geometry, faces, distance, grouping, meshNormalScale(target));
      if (result.applied) appendNewFaceSegments(geometry, faces, firstWall, target, points);
    }
    return points;
  }

  /**
   * Builds world line segments of the faces an inset would create, without
   * touching the scene.
   *
   * @param thickness World inward distance.
   * @param depth Signed world distance along the normal.
   * @param grouping Region or individual grouping.
   * @returns Flat list of segment endpoints, two points per segment.
   */
  previewFaceInset(thickness: number, depth: number, grouping: TopologyFaceInsetGrouping): THREE.Vector3[] {
    const points: THREE.Vector3[] = [];
    for (const { target, faces } of this.collectMeshFaceSelections('Inset Faces')) {
      const geometry = loadWorkingGeometryFromTarget(target);
      const firstRing = geometry.faces.length;
      const scale = meshUniformScale(target);
      const result = insetTopologyWorkingFaceRegions(geometry, faces, thickness / scale, depth / scale, grouping);
      if (result.applied) appendNewFaceSegments(geometry, faces, firstRing, target, points);
    }
    return points;
  }

  /**
   * Insets the selected mesh faces and keeps them selected.
   *
   * @param thickness World inward distance.
   * @param depth Signed world distance along the normal.
   * @param grouping Region or individual grouping.
   * @returns True when at least one mesh changed.
   */
  insetSelectedFaces(thickness: number, depth: number, grouping: TopologyFaceInsetGrouping): boolean {
    return this.mutateSelectedMeshFaces('Inset Faces', (target, geometry, faces) => {
      const scale = meshUniformScale(target);
      return insetTopologyWorkingFaceRegions(geometry, faces, thickness / scale, depth / scale, grouping);
    });
  }

  /**
   * Extrudes the selected mesh faces by a world distance and keeps them
   * selected so they can be scaled or moved on.
   *
   * @param distance Signed world distance; negative pushes into the mesh.
   * @param grouping Region or individual grouping.
   * @returns True when at least one mesh changed.
   */
  extrudeSelectedFaces(distance: number, grouping: TopologyFaceExtrudeGrouping): boolean {
    return this.mutateSelectedMeshFaces('Extrude Faces', (target, geometry, faces) =>
      extrudeTopologyWorkingFaces(geometry, faces, distance, grouping, meshNormalScale(target)),
    );
  }

  /**
   * Commits an operator on the selected faces of every edited mesh, one undo
   * step per mesh, and keeps the faces selected.
   *
   * @param toolLabel Tool name used in status messages.
   * @param operate Operator run on each mesh's working geometry.
   * @returns True when at least one mesh changed.
   */
  private mutateSelectedMeshFaces(
    toolLabel: string,
    operate: (target: TopologyMeshTarget, geometry: TopologyWorkingGeometry, faces: number[]) => TopologyOperatorResult,
  ): boolean {
    const selections = this.collectMeshFaceSelections(toolLabel);
    if (selections.length === 0) return false;
    let appliedAny = false;
    let lastMessage = '';
    for (const { target, faces } of selections) {
      const result = commitTopologyWorkingMutation(
        target,
        this.deps.getCommandStack(),
        (geometry) => operate(target, geometry, faces),
        () => this.deps.refreshPresentation(),
      );
      appliedAny = appliedAny || result.applied;
      lastMessage = result.message || lastMessage;
    }
    this.finishFaceMutation(appliedAny, lastMessage);
    return appliedAny;
  }

  /**
   * Re-applies the face selection, refreshes the cage and reports the result.
   *
   * @param appliedAny Whether any mesh changed.
   * @param message Status text.
   */
  private finishFaceMutation(appliedAny: boolean, message: string): void {
    if (appliedAny) {
      const selection = this.deps.getSession().getComponentSelection();
      selection.replaceAll(selection.getSelected().slice());
      this.deps.refreshPresentation();
    }
    if (message) this.deps.showStatusMessage(message);
  }

  /**
   * Collects selected faces of edited meshes, reporting why nothing applies.
   *
   * @param toolLabel Tool name used in status messages.
   * @returns Mesh face selections; empty outside Face mode.
   */
  private collectMeshFaceSelections(toolLabel: string): MeshFaceSelection[] {
    const session = this.deps.getSession();
    if (!session.isActive()) return [];
    if (session.getComponentMode() !== EditorComponentMode.FACE) {
      this.deps.showStatusMessage(`${toolLabel} works in Face mode`);
      return [];
    }
    const selected = session.getComponentSelection().getSelected();
    const selections: MeshFaceSelection[] = [];
    for (const targetId of collectSelectionTargetIds(selected)) {
      const domain = findEditDomainTargetById(session.getDomain(), targetId);
      const target = domain ? resolveTopologyEditTarget(domain) : null;
      const faces = collectSelectedFaceIndices(selected, targetId);
      if (target?.kind === 'mesh' && faces.length > 0) selections.push({ target, faces });
    }
    if (selections.length === 0) this.deps.showStatusMessage(`${toolLabel} needs selected mesh faces`);
    return selections;
  }
}

/**
 * Returns the average world length of one local unit of a mesh.
 *
 * @param target Mesh target.
 * @returns Uniform scale estimate, never zero.
 */
function meshUniformScale(target: TopologyMeshTarget): number {
  target.mesh.updateMatrixWorld(true);
  const determinant = Math.abs(new THREE.Matrix3().setFromMatrix4(target.mesh.matrixWorld).determinant());
  return Math.max(1e-12, Math.cbrt(determinant));
}

/**
 * Appends the edges of the given faces and of every face from an index on.
 *
 * @param geometry Working geometry after an operator ran.
 * @param faces Faces that were operated on.
 * @param firstNewFace Index of the first face the operator added.
 * @param target Mesh target for the world matrix.
 * @param points Output endpoints.
 */
function appendNewFaceSegments(
  geometry: TopologyWorkingGeometry,
  faces: readonly number[],
  firstNewFace: number,
  target: TopologyMeshTarget,
  points: THREE.Vector3[],
): void {
  const created = geometry.faces.map((_face, index) => index).filter((index) => index >= firstNewFace);
  appendFaceEdgeSegments(geometry, [...faces, ...created], target.mesh.matrixWorld, points);
}

/**
 * Returns how long one local unit along a normal is in world space.
 *
 * @param target Mesh target.
 * @returns Scale function for local normals.
 */
function meshNormalScale(target: TopologyMeshTarget): (localNormal: THREE.Vector3) => number {
  target.mesh.updateMatrixWorld(true);
  const linear = new THREE.Matrix3().setFromMatrix4(target.mesh.matrixWorld);
  return (localNormal) => Math.max(1e-12, localNormal.clone().applyMatrix3(linear).length());
}

/**
 * Sums the world motion directions of every region of a mesh selection.
 *
 * @param target Mesh target.
 * @param geometry Working geometry.
 * @param faces Selected faces.
 * @returns Unnormalized world direction sum.
 */
function meshFaceSelectionWorldDirection(
  target: TopologyMeshTarget,
  geometry: TopologyWorkingGeometry,
  faces: readonly number[],
): THREE.Vector3 {
  const linear = new THREE.Matrix3().setFromMatrix4(target.mesh.matrixWorld);
  const sum = new THREE.Vector3();
  for (const region of collectTopologyFaceRegions(geometry, faces)) {
    sum.add(region.normal.clone().applyMatrix3(linear).normalize().multiplyScalar(region.faceIndices.length));
  }
  return sum;
}

/**
 * Returns the world direction of the first region of a selection.
 *
 * @param selection Mesh face selection.
 * @returns Unit direction, or +Y when the faces are degenerate.
 */
function firstRegionWorldDirection(selection: MeshFaceSelection): THREE.Vector3 {
  const geometry = loadWorkingGeometryFromTarget(selection.target);
  const region = collectTopologyFaceRegions(geometry, selection.faces)[0];
  const linear = new THREE.Matrix3().setFromMatrix4(selection.target.mesh.matrixWorld);
  const direction = region ? region.normal.clone().applyMatrix3(linear) : new THREE.Vector3();
  return direction.lengthSq() > 1e-20 ? direction.normalize() : new THREE.Vector3(0, 1, 0);
}

/**
 * Adds the world positions of the selected faces' corners to a sum.
 *
 * @param target Mesh target.
 * @param geometry Working geometry.
 * @param faces Selected faces.
 * @param sum Running world sum.
 * @returns Number of corners added.
 */
function addFaceCornersToWorldSum(
  target: TopologyMeshTarget,
  geometry: TopologyWorkingGeometry,
  faces: readonly number[],
  sum: THREE.Vector3,
): number {
  let count = 0;
  for (const face of faces) {
    for (const vertex of geometry.faces[face]?.vertexIndices ?? []) {
      sum.add(geometry.positions[vertex]!.clone().applyMatrix4(target.mesh.matrixWorld));
      count += 1;
    }
  }
  return count;
}

/**
 * Appends each distinct edge of some faces as a world segment.
 *
 * @param geometry Working geometry.
 * @param faces Faces whose edges are drawn.
 * @param worldMatrix Local-to-world matrix.
 * @param points Output endpoints, two per segment.
 */
function appendFaceEdgeSegments(
  geometry: TopologyWorkingGeometry,
  faces: readonly number[],
  worldMatrix: THREE.Matrix4,
  points: THREE.Vector3[],
): void {
  const seen = new Set<string>();
  for (const face of faces) {
    const loop = geometry.faces[face]?.vertexIndices ?? [];
    loop.forEach((vertex, corner) => {
      const next = loop[(corner + 1) % loop.length]!;
      const key = vertex < next ? `${vertex}:${next}` : `${next}:${vertex}`;
      if (seen.has(key)) return;
      seen.add(key);
      points.push(geometry.positions[vertex]!.clone().applyMatrix4(worldMatrix));
      points.push(geometry.positions[next]!.clone().applyMatrix4(worldMatrix));
    });
  }
}
