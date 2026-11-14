import * as THREE from 'three';
import { EditorComponentMode } from '@/types/editor_component_mode.js';
import type { HandlerComponentTopologyDependencies } from './handler_component_topology.js';
import { commitTopologyWorkingMutation, loadWorkingGeometryFromTarget } from './topology_commit.js';
import { extrudeTopologyWorkingFaces, type TopologyFaceExtrudeGrouping } from './topology_face_extrude.js';
import { collectTopologyFaceRegions } from './topology_face_region.js';
import { collectSelectedFaceIndices, collectSelectionTargetIds } from './topology_selection_vertices.js';
import { findEditDomainTargetById, resolveTopologyEditTarget } from './topology_target_resolve.js';
import type { TopologyMeshTarget } from './topology_target.js';
import type { TopologyWorkingGeometry } from './topology_working_geometry.js';

/** World line the extrude drag measures its distance along. */
export interface FaceExtrudeAxis {
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
 * Runs mesh modelling operations (extrude and friends) on the Edit Mode
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
   * Returns the drag axis for extruding the selected faces.
   *
   * @returns Axis, or null when no mesh faces are selected in Face mode.
   */
  describeFaceExtrudeAxis(): FaceExtrudeAxis | null {
    const selections = this.collectMeshFaceSelections();
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
    for (const { target, faces } of this.collectMeshFaceSelections()) {
      const geometry = loadWorkingGeometryFromTarget(target);
      const firstWall = geometry.faces.length;
      const result = extrudeTopologyWorkingFaces(geometry, faces, distance, grouping, meshNormalScale(target));
      if (!result.applied) continue;
      const shown = [...faces, ...geometry.faces.map((_face, index) => index).filter((index) => index >= firstWall)];
      appendFaceEdgeSegments(geometry, shown, target.mesh.matrixWorld, points);
    }
    return points;
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
    const selections = this.collectMeshFaceSelections();
    if (selections.length === 0) return false;
    let appliedAny = false;
    let lastMessage = '';
    for (const { target, faces } of selections) {
      const result = commitTopologyWorkingMutation(
        target,
        this.deps.getCommandStack(),
        (geometry) => extrudeTopologyWorkingFaces(geometry, faces, distance, grouping, meshNormalScale(target)),
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
   * @returns Mesh face selections; empty outside Face mode.
   */
  private collectMeshFaceSelections(): MeshFaceSelection[] {
    const session = this.deps.getSession();
    if (!session.isActive()) return [];
    if (session.getComponentMode() !== EditorComponentMode.FACE) {
      this.deps.showStatusMessage('Extrude Faces works in Face mode');
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
    if (selections.length === 0) this.deps.showStatusMessage('Select mesh faces to extrude');
    return selections;
  }
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
