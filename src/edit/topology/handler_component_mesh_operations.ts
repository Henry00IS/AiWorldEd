import * as THREE from 'three';
import { EditorComponentMode } from '@/types/editor_component_mode.js';
import { buildComponentEdgeKey, type ComponentSelectionEntry } from '@/edit/component/component_selection_entry.js';
import type { HandlerComponentTopologyDependencies } from './handler_component_topology.js';
import { commitTopologyWorkingMutation, loadWorkingGeometryFromTarget } from './topology_commit.js';
import { extrudeTopologyWorkingFaces, type TopologyFaceExtrudeGrouping } from './topology_face_extrude.js';
import { collectTopologyFaceRegions } from './topology_face_region.js';
import { insetTopologyWorkingFaceRegions, type TopologyFaceInsetGrouping } from './topology_face_inset_region.js';
import type { TopologyOperatorResult } from './topology_operator_result.js';
import {
  collectSelectedEdgeEndpoints,
  collectSelectedVertexIndices,
  collectSelectedFaceIndices,
  collectSelectionTargetIds,
} from './topology_selection_vertices.js';
import { subdivideTopologyWorkingEdges, type TopologyEdgeEndpoints } from './topology_edge_subdivide.js';
import {
  collectTopologyBorderEdges,
  extrudeTopologyWorkingEdges,
  topologyBorderEdgeOffsets,
} from './topology_edge_extrude.js';
import { makeTopologyWorkingFace } from './topology_face_make.js';
import { duplicateTopologyWorkingFaces, flipTopologyWorkingFaces } from './topology_face_copy.js';
import { connectTopologyWorkingVertices } from './topology_vertex_connect.js';
import { bridgeTopologyWorkingEdgeLoops } from './topology_edge_bridge.js';
import { bevelTopologyWorkingEdges } from './topology_edge_bevel.js';
import {
  pokeTopologyWorkingFaces,
  triangulateTopologyWorkingFaces,
  type TopologyFaceSplitOutcome,
} from './topology_face_triangulate.js';
import { joinTopologyWorkingTriangles } from './topology_face_join_triangles.js';
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

/** Selected edges of one edited mesh. */
interface MeshEdgeSelection {
  /** Target id. */
  targetId: string;
  /** Live mesh target. */
  target: TopologyMeshTarget;
  /** Selected edges. */
  edges: TopologyEdgeEndpoints[];
}

/** Selected faces of one edited mesh. */
interface MeshFaceSelection {
  /** Target id. */
  targetId: string;
  /** Live mesh target. */
  target: TopologyMeshTarget;
  /** Selected face indices. */
  faces: number[];
}

/**
 * Runs mesh modelling operations (extrude, inset, subdivide, bridge and
 * friends) on the Edit Mode selection. Brushes are left alone: these operations
 * add faces a convex brush cannot hold.
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
   * Returns the drag axis of the current extrusion: along the face normal in
   * Face mode, straight out of the faces in Edge mode.
   *
   * @returns Axis, or null when nothing can be extruded.
   */
  describeExtrudeAxis(): FaceSelectionAxis | null {
    if (!this.isEdgeMode()) return this.describeFaceSelectionAxis('Extrude Faces');
    const selections = this.collectMeshEdgeSelections();
    const anchor = new THREE.Vector3();
    const direction = new THREE.Vector3();
    let count = 0;
    for (const { target, edges } of selections) {
      count += addBorderOffsetsToWorldSums(target, edges, anchor, direction);
    }
    if (count === 0) return null;
    return { anchor: anchor.divideScalar(count), direction: direction.normalize() };
  }

  /**
   * Builds world line segments of what the current extrusion would create.
   *
   * @param distance Signed world distance.
   * @param grouping Region or individual grouping of faces.
   * @returns Flat list of segment endpoints.
   */
  previewExtrude(distance: number, grouping: TopologyFaceExtrudeGrouping): THREE.Vector3[] {
    if (!this.isEdgeMode()) return this.previewFaceExtrude(distance, grouping);
    const points: THREE.Vector3[] = [];
    for (const { target, edges } of this.collectMeshEdgeSelections()) {
      const geometry = loadWorkingGeometryFromTarget(target);
      const firstNew = geometry.faces.length;
      const outcome = extrudeTopologyWorkingEdges(geometry, edges, distance, meshNormalScale(target));
      if (outcome.result.applied) appendNewFaceSegments(geometry, [], firstNew, target, points);
    }
    return points;
  }

  /**
   * Extrudes the selected faces, or in Edge mode the selected border edges, and
   * selects the result so it can be moved or scaled on.
   *
   * @param distance Signed world distance.
   * @param grouping Region or individual grouping of faces.
   * @returns True when at least one mesh changed.
   */
  extrudeSelection(distance: number, grouping: TopologyFaceExtrudeGrouping): boolean {
    if (!this.isEdgeMode()) return this.extrudeSelectedFaces(distance, grouping);
    const outer: ComponentSelectionEntry[] = [];
    const targets = this.collectMeshEdgeSelections();
    return this.commitOnMeshTargets(
      targets.map(({ targetId, target }) => ({ targetId, target })),
      (targetId, geometry) => {
        const { target, edges } = targets.find((entry) => entry.targetId === targetId)!;
        const outcome = extrudeTopologyWorkingEdges(geometry, edges, distance, meshNormalScale(target));
        outer.push(...outcome.outerEdges.map(([a, b]) => meshEdgeEntry(targetId, a, b)));
        return outcome.result;
      },
      () => this.deps.getSession().getComponentSelection().replaceAll(outer),
    );
  }

  /**
   * Returns the label of the current extrusion for the status bar.
   *
   * @param grouping Region or individual grouping of faces.
   * @returns Tool label.
   */
  describeExtrudeLabel(grouping: TopologyFaceExtrudeGrouping): string {
    if (this.isEdgeMode()) return 'Extrude Edges';
    return grouping === 'individual' ? 'Extrude Faces Individually' : 'Extrude Faces';
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
   * Reverses the winding of the selected mesh faces so they face the other way.
   *
   * @returns True when at least one mesh changed.
   */
  flipSelectedFaces(): boolean {
    return this.mutateSelectedMeshFaces('Flip Faces', (_target, geometry, faces) =>
      flipTopologyWorkingFaces(geometry, faces),
    );
  }

  /**
   * Copies the selected mesh faces onto new vertices and selects the copies,
   * ready to be moved away.
   *
   * @returns True when at least one mesh changed.
   */
  duplicateSelectedFaces(): boolean {
    const selections = this.collectMeshFaceSelections('Duplicate Faces');
    const copies: ComponentSelectionEntry[] = [];
    return this.commitOnMeshTargets(
      selections,
      (targetId, geometry) => {
        const faces = selections.find((entry) => entry.targetId === targetId)?.faces ?? [];
        const outcome = duplicateTopologyWorkingFaces(geometry, faces);
        copies.push(...outcome.copies.map((face) => ({ targetId, kind: 'face' as const, componentKey: String(face) })));
        return outcome.result;
      },
      () => this.deps.getSession().getComponentSelection().replaceAll(copies),
    );
  }

  /**
   * Splits the selected mesh faces into triangles and selects every piece.
   *
   * @returns True when at least one mesh changed.
   */
  triangulateSelectedFaces(): boolean {
    return this.splitSelectedFaces('Triangulate Faces', triangulateTopologyWorkingFaces);
  }

  /**
   * Fans the selected mesh faces from their centres and selects every piece.
   *
   * @returns True when at least one mesh changed.
   */
  pokeSelectedFaces(): boolean {
    return this.splitSelectedFaces('Poke Faces', pokeTopologyWorkingFaces);
  }

  /**
   * Joins flat pairs of selected triangles into quads and selects the result.
   *
   * @returns True when at least one mesh changed.
   */
  joinSelectedTriangles(): boolean {
    return this.splitSelectedFaces('Join Triangles', joinTopologyWorkingTriangles);
  }

  /**
   * Runs an operator that reshapes faces on each edited mesh and selects every
   * resulting face.
   *
   * @param toolLabel Tool name used in status messages.
   * @param split Operator.
   * @returns True when at least one mesh changed.
   */
  private splitSelectedFaces(
    toolLabel: string,
    split: (geometry: TopologyWorkingGeometry, faces: readonly number[]) => TopologyFaceSplitOutcome,
  ): boolean {
    const selections = this.collectMeshFaceSelections(toolLabel);
    const pieces: ComponentSelectionEntry[] = [];
    return this.commitOnMeshTargets(
      selections,
      (targetId, geometry) => {
        const outcome = split(geometry, selections.find((entry) => entry.targetId === targetId)?.faces ?? []);
        pieces.push(...outcome.faces.map((face) => ({ targetId, kind: 'face' as const, componentKey: String(face) })));
        return outcome.result;
      },
      () => this.deps.getSession().getComponentSelection().replaceAll(pieces),
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
    this.finishMutation(appliedAny, lastMessage);
    return appliedAny;
  }

  /**
   * Re-applies the current selection, refreshes the cage and reports the
   * result.
   *
   * @param appliedAny Whether any mesh changed.
   * @param message Status text.
   */
  private finishMutation(appliedAny: boolean, message: string): void {
    if (appliedAny) {
      const selection = this.deps.getSession().getComponentSelection();
      selection.replaceAll(selection.getSelected().slice());
      this.deps.refreshPresentation();
    }
    if (message) this.deps.showStatusMessage(message);
  }

  /**
   * Splits every selected mesh edge into evenly spaced pieces and selects the
   * pieces.
   *
   * @param cuts Number of new vertices per edge.
   * @returns True when at least one mesh changed.
   */
  subdivideSelectedEdges(cuts: number): boolean {
    const selected = this.deps.getSession().getComponentSelection().getSelected();
    const pieces: ComponentSelectionEntry[] = [];
    const targets = this.collectMeshTargets('Subdivide Edges', [EditorComponentMode.EDGE], 'Edge');
    return this.commitOnMeshTargets(
      targets,
      (targetId, geometry) => {
        const outcome = subdivideTopologyWorkingEdges(geometry, collectSelectedEdgeEndpoints(selected, targetId), cuts);
        pieces.push(...outcome.pieces.map(([a, b]) => meshEdgeEntry(targetId, a, b)));
        return outcome.result;
      },
      () => this.deps.getSession().getComponentSelection().replaceAll(pieces),
    );
  }

  /**
   * Adds one face through the selected vertices, or through the ends of the
   * selected edges, on every edited mesh.
   *
   * @returns True when at least one mesh changed.
   */
  makeFaceFromSelection(): boolean {
    const selected = this.deps.getSession().getComponentSelection().getSelected();
    const modes = [EditorComponentMode.VERTEX, EditorComponentMode.EDGE];
    const targets = this.collectMeshTargets('Make Face', modes, 'Vertex or Edge');
    return this.commitOnMeshTargets(targets, (targetId, geometry) =>
      makeTopologyWorkingFace(geometry, [
        ...collectSelectedVertexIndices(selected, targetId),
        ...collectSelectedEdgeEndpoints(selected, targetId).flatMap((edge) => [edge.vertexA, edge.vertexB]),
      ]),
    );
  }

  /**
   * Cuts the faces between selected vertices with new edges.
   *
   * @returns True when at least one mesh changed.
   */
  connectSelectedVertices(): boolean {
    const selected = this.deps.getSession().getComponentSelection().getSelected();
    const targets = this.collectMeshTargets('Connect Vertices', [EditorComponentMode.VERTEX], 'Vertex');
    return this.commitOnMeshTargets(
      targets,
      (targetId, geometry) =>
        connectTopologyWorkingVertices(geometry, collectSelectedVertexIndices(selected, targetId)).result,
    );
  }

  /**
   * Joins the two selected edge loops of each edited mesh with quads.
   *
   * @returns True when at least one mesh changed.
   */
  bridgeSelectedEdgeLoops(): boolean {
    const selected = this.deps.getSession().getComponentSelection().getSelected();
    const targets = this.collectMeshTargets('Bridge Edge Loops', [EditorComponentMode.EDGE], 'Edge');
    return this.commitOnMeshTargets(targets, (targetId, geometry) =>
      bridgeTopologyWorkingEdgeLoops(geometry, collectSelectedEdgeEndpoints(selected, targetId)),
    );
  }

  /**
   * Returns the world centre of the selected edges, which the bevel tool
   * measures the pointer from.
   *
   * @returns Centre with an unused up direction, or null without edges.
   */
  describeEdgeBevelCentre(): FaceSelectionAxis | null {
    const anchor = new THREE.Vector3();
    let count = 0;
    for (const { target, edges } of this.collectMeshEdgeSelections('Bevel Edges')) {
      const positions = loadWorkingGeometryFromTarget(target).positions;
      for (const vertex of edges.flatMap((edge) => [edge.vertexA, edge.vertexB])) {
        const point = positions[vertex];
        if (point) anchor.add(point.clone().applyMatrix4(target.mesh.matrixWorld));
        count += point ? 1 : 0;
      }
    }
    return count > 0 ? { anchor: anchor.divideScalar(count), direction: new THREE.Vector3(0, 1, 0) } : null;
  }

  /**
   * Builds world line segments of the chamfer faces a bevel would create.
   *
   * @param width World width.
   * @returns Flat list of segment endpoints.
   */
  previewEdgeBevel(width: number): THREE.Vector3[] {
    const points: THREE.Vector3[] = [];
    for (const { target, edges } of this.collectMeshEdgeSelections('Bevel Edges')) {
      const geometry = loadWorkingGeometryFromTarget(target);
      const outcome = bevelTopologyWorkingEdges(geometry, edges, width / meshUniformScale(target));
      if (outcome.result.applied) appendNewFaceSegments(geometry, outcome.faces, geometry.faces.length, target, points);
    }
    return points;
  }

  /**
   * Bevels the selected mesh edges and selects the edges of the chamfers.
   *
   * @param width World width.
   * @returns True when at least one mesh changed.
   */
  bevelSelectedEdges(width: number): boolean {
    const selections = this.collectMeshEdgeSelections('Bevel Edges');
    const outlines: ComponentSelectionEntry[] = [];
    return this.commitOnMeshTargets(
      selections,
      (targetId, geometry) => {
        const { target, edges } = selections.find((entry) => entry.targetId === targetId)!;
        const outcome = bevelTopologyWorkingEdges(geometry, edges, width / meshUniformScale(target));
        for (const face of outcome.faces) outlines.push(...faceOutlineEntries(targetId, geometry, face));
        return outcome.result;
      },
      () => this.deps.getSession().getComponentSelection().replaceAll(outlines),
    );
  }

  /**
   * Commits an operator on every mesh target, one undo step per mesh, then
   * refreshes and reports.
   *
   * @param targets Mesh targets.
   * @param operate Operator run on each working geometry.
   * @param afterApplied Runs once when any mesh changed, before the refresh.
   * @returns True when at least one mesh changed.
   */
  private commitOnMeshTargets(
    targets: ReadonlyArray<{ targetId: string; target: TopologyMeshTarget }>,
    operate: (targetId: string, geometry: TopologyWorkingGeometry) => TopologyOperatorResult,
    afterApplied: () => void = () => undefined,
  ): boolean {
    let appliedAny = false;
    let lastMessage = '';
    for (const { targetId, target } of targets) {
      const refresh = () => this.deps.refreshPresentation();
      const result = commitTopologyWorkingMutation(
        target,
        this.deps.getCommandStack(),
        (g) => operate(targetId, g),
        refresh,
      );
      appliedAny = appliedAny || result.applied;
      lastMessage = result.message || lastMessage;
    }
    if (appliedAny) afterApplied();
    this.finishMutation(appliedAny, lastMessage);
    return appliedAny;
  }

  /**
   * Returns whether the edit session is in Edge mode.
   *
   * @returns True in Edge mode.
   */
  private isEdgeMode(): boolean {
    return this.deps.getSession().getComponentMode() === EditorComponentMode.EDGE;
  }

  /**
   * Collects selected edges of edited meshes in Edge mode.
   *
   * @param toolLabel Tool name used in status messages.
   * @returns Mesh edge selections.
   */
  private collectMeshEdgeSelections(toolLabel = 'Extrude Edges'): MeshEdgeSelection[] {
    const selected = this.deps.getSession().getComponentSelection().getSelected();
    return this.collectMeshTargets(toolLabel, [EditorComponentMode.EDGE], 'Edge').map(({ targetId, target }) => ({
      targetId,
      target,
      edges: collectSelectedEdgeEndpoints(selected, targetId),
    }));
  }

  /**
   * Collects selected faces of edited meshes, reporting why nothing applies.
   *
   * @param toolLabel Tool name used in status messages.
   * @returns Mesh face selections; empty outside Face mode.
   */
  private collectMeshFaceSelections(toolLabel: string): MeshFaceSelection[] {
    const selected = this.deps.getSession().getComponentSelection().getSelected();
    return this.collectMeshTargets(toolLabel, [EditorComponentMode.FACE], 'Face')
      .map(({ targetId, target }) => ({ targetId, target, faces: collectSelectedFaceIndices(selected, targetId) }))
      .filter((entry) => entry.faces.length > 0);
  }

  /**
   * Collects the edited meshes that have selected components in a mode,
   * reporting why nothing applies.
   *
   * @param toolLabel Tool name used in status messages.
   * @param modes Component modes the tool works in.
   * @param modeName Title of those modes for messages.
   * @returns Mesh targets with a selection.
   */
  private collectMeshTargets(
    toolLabel: string,
    modes: readonly EditorComponentMode[],
    modeName: string,
  ): Array<{ targetId: string; target: TopologyMeshTarget }> {
    const session = this.deps.getSession();
    if (!session.isActive()) return [];
    if (!modes.includes(session.getComponentMode())) {
      this.deps.showStatusMessage(`${toolLabel} works in ${modeName} mode`);
      return [];
    }
    const targets: Array<{ targetId: string; target: TopologyMeshTarget }> = [];
    for (const targetId of collectSelectionTargetIds(session.getComponentSelection().getSelected())) {
      const domain = findEditDomainTargetById(session.getDomain(), targetId);
      const target = domain ? resolveTopologyEditTarget(domain) : null;
      if (target?.kind === 'mesh') targets.push({ targetId, target });
    }
    if (targets.length === 0) this.deps.showStatusMessage(`${toolLabel} needs a selection on a mesh`);
    return targets;
  }
}

/**
 * Adds the world positions of selected border vertices and their world outward
 * directions to running sums.
 *
 * @param target Mesh target.
 * @param edges Selected edges.
 * @param anchor Running position sum.
 * @param direction Running direction sum.
 * @returns Number of vertices added.
 */
function addBorderOffsetsToWorldSums(
  target: TopologyMeshTarget,
  edges: readonly TopologyEdgeEndpoints[],
  anchor: THREE.Vector3,
  direction: THREE.Vector3,
): number {
  const geometry = loadWorkingGeometryFromTarget(target);
  const offsets = topologyBorderEdgeOffsets(geometry, collectTopologyBorderEdges(geometry, edges));
  const linear = new THREE.Matrix3().setFromMatrix4(target.mesh.matrixWorld);
  for (const [vertex, offset] of offsets) {
    anchor.add(geometry.positions[vertex]!.clone().applyMatrix4(target.mesh.matrixWorld));
    direction.add(offset.clone().applyMatrix3(linear).normalize());
  }
  return offsets.size;
}

/**
 * Builds edge selection entries for every edge of one face.
 *
 * @param targetId Target id.
 * @param geometry Working geometry.
 * @param face Face index.
 * @returns Selection entries.
 */
function faceOutlineEntries(
  targetId: string,
  geometry: TopologyWorkingGeometry,
  face: number,
): ComponentSelectionEntry[] {
  const loop = geometry.faces[face]?.vertexIndices ?? [];
  return loop.map((vertex, corner) => meshEdgeEntry(targetId, vertex, loop[(corner + 1) % loop.length]!));
}

/**
 * Builds an edge selection entry.
 *
 * @param targetId Target id.
 * @param vertexA First endpoint.
 * @param vertexB Second endpoint.
 * @returns Selection entry.
 */
function meshEdgeEntry(targetId: string, vertexA: number, vertexB: number): ComponentSelectionEntry {
  return { targetId, kind: 'edge', componentKey: buildComponentEdgeKey(vertexA, vertexB) };
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
