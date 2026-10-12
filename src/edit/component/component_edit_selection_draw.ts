import * as THREE from 'three';
import { Theme } from '@/theme.js';
import type { MeshDocument } from '@/mesh/document/mesh_document.js';
import { meshVertexPositionRead } from '@/mesh/topology/mesh_vertex_position.js';
import {
  meshTopologyFaceHalfEdgeIndices,
  meshTopologyHalfEdgeCornerVertex,
  meshTopologyHalfEdgeDestinationVertex,
} from '@/mesh/topology/mesh_topology_query.js';
import { packStoredEdgeKey, packUndirectedEdge } from './component_selection_entry.js';
import {
  collectMeshEdges,
  collectMeshFaceVertexIndices,
  collectMeshWorldVertices,
} from './component_edit_cage_mesh_index.js';
import type { ComponentSelectionEntry } from './component_selection_entry.js';
import type { BrushEditCage } from '@/edit/brush/brush_edit_cage.js';
import { triangulateSimplePolygon3d } from '@/mesh/convert/mesh_polygon_triangulate.js';

/** Content-mesh cage source for domain display and selection draw. */
export interface ComponentCageMeshSource {
  targetId: string;
  mesh: THREE.Mesh;
  document: MeshDocument;
}

/** Blender-like selected vertex color (bright white). */
export const EDIT_SELECTED_VERTEX_COLOR = 0xffffff;

/** Selected face fill accent (theme orange). */
export const EDIT_SELECTED_EDGE_COLOR = Theme.selectionColor;

/**
 * Unselected cage vertex color. Always black so dots stay readable on light 2D
 * grids and dark 3D backgrounds.
 */
export const EDIT_CAGE_COLOR = 0x000000;

/**
 * Non-domain content/brush wire color in orthographic 2D viewports while Edit
 * Mode is active.
 */
export const EDIT_MODE_REST_WIRE_COLOR_2D = 0x000000;

/**
 * Packed cage draw buffers. Vertices always include every domain corner; color
 * flips black/white for selection (no second oversized selected point layer).
 */
export interface ComponentCageDrawBuffers {
  vertexCoords: number[];
  vertexColors: number[];
  edgeCoords: number[];
  edgePairs: number[];
}

/** Packed selection draw buffers for edges and faces (verts live on the cage). */
export interface ComponentSelectionDrawBuffers {
  fullEdgeCoords: number[];
  fullEdgePairs: number[];
  halfEdgeCoords: number[];
  halfEdgePairs: number[];
  /**
   * Per-vertex fade weight for half edges (0 = selected end / solid orange, 1 =
   * fade end). Consumed by the half-edge line shader.
   */
  halfEdgeFadeT: number[];
  faceCoords: number[];
  faceVertexIndices: number[];
}

/** Per-target selection sets used for draw masking. */
export interface TargetSelectionSets {
  vertices: Set<number>;
  edges: Set<string>;
  faces: Set<number>;
}

/**
 * Builds inactive black cage buffers with selected verts/edges masked out so
 * orange selection is not double-drawn over black wire.
 *
 * @param meshSources Content mesh sources.
 * @param brushCages Brush cages.
 * @param selected Current component selection.
 * @returns Cage vertex and edge coordinates.
 */
export function buildComponentCageDrawBuffers(
  meshSources: readonly ComponentCageMeshSource[],
  brushCages: readonly BrushEditCage[],
  selected: readonly ComponentSelectionEntry[],
): ComponentCageDrawBuffers {
  const byTarget = groupSelectionByTarget(selected);
  const buffers: ComponentCageDrawBuffers = {
    vertexCoords: [],
    vertexColors: [],
    edgeCoords: [],
    edgePairs: [],
  };
  for (const source of meshSources) {
    appendMaskedMeshCage(source, byTarget.get(source.targetId), buffers);
  }
  for (const cage of brushCages) {
    appendMaskedBrushCage(cage, byTarget.get(cage.targetId), buffers);
  }
  return buffers;
}

/**
 * Builds Blender-style selection draw buffers from the current component set.
 *
 * @param meshSources Content mesh sources.
 * @param brushCages Brush cages.
 * @param selected Selection entries.
 * @returns Packed draw buffers.
 */
export function buildComponentSelectionDrawBuffers(
  meshSources: readonly ComponentCageMeshSource[],
  brushCages: readonly BrushEditCage[],
  selected: readonly ComponentSelectionEntry[],
): ComponentSelectionDrawBuffers {
  const buffers = createEmptySelectionBuffers();
  const byTarget = groupSelectionByTarget(selected);
  for (const source of meshSources) {
    const selection = byTarget.get(source.targetId);
    if (!selection) {
      continue;
    }
    appendMeshSelectionDraw(source, selection, buffers);
  }
  for (const cage of brushCages) {
    const selection = byTarget.get(cage.targetId);
    if (!selection) {
      continue;
    }
    appendBrushSelectionDraw(cage, selection, buffers);
  }
  return buffers;
}

/**
 * Creates empty selection draw buffers.
 *
 * @returns Empty buffer object.
 */
function createEmptySelectionBuffers(): ComponentSelectionDrawBuffers {
  return {
    fullEdgeCoords: [],
    fullEdgePairs: [],
    halfEdgeCoords: [],
    halfEdgePairs: [],
    halfEdgeFadeT: [],
    faceCoords: [],
    faceVertexIndices: [],
  };
}

/**
 * Groups selection entries by domain target.
 *
 * @param selected Selection entries.
 * @returns Map of target id → sets.
 */
function groupSelectionByTarget(selected: readonly ComponentSelectionEntry[]): Map<string, TargetSelectionSets> {
  const map = new Map<string, TargetSelectionSets>();
  for (const entry of selected) {
    const sets = ensureTargetSelectionSets(map, entry.targetId);
    addEntryToSelectionSets(entry, sets);
  }
  return map;
}

/**
 * Ensures a selection-set entry exists for a target id.
 *
 * @param map Target map.
 * @param targetId Domain target id.
 * @returns Selection sets for the target.
 */
function ensureTargetSelectionSets(map: Map<string, TargetSelectionSets>, targetId: string): TargetSelectionSets {
  let sets = map.get(targetId);
  if (!sets) {
    sets = { vertices: new Set(), edges: new Set(), faces: new Set() };
    map.set(targetId, sets);
  }
  return sets;
}

/**
 * Adds one selection entry into target sets.
 *
 * @param entry Selection entry.
 * @param sets Target sets.
 */
function addEntryToSelectionSets(entry: ComponentSelectionEntry, sets: TargetSelectionSets): void {
  if (entry.kind === 'vertex') {
    sets.vertices.add(Number(entry.componentKey));
    return;
  }
  if (entry.kind === 'edge') {
    sets.edges.add(entry.componentKey);
    return;
  }
  sets.faces.add(Number(entry.componentKey));
}

/**
 * Appends masked black cage geometry for one content mesh.
 *
 * @param source Mesh source.
 * @param selection Selection sets, if any.
 * @param buffers Cage buffers.
 */
function appendMaskedMeshCage(
  source: ComponentCageMeshSource,
  selection: TargetSelectionSets | undefined,
  buffers: ComponentCageDrawBuffers,
): void {
  source.mesh.updateMatrixWorld(true);
  const worldVerts = collectMeshWorldVertices(source);
  const edges = collectMeshEdges(source.document);
  const faceVertexIndices = collectMeshFaceVertexIndices(source.document, selection?.faces);
  const mask = buildDrawMask(selection, edges, faceVertexIndices);
  appendCageVertices(worldVerts, mask.selectedVertices, buffers);
  appendMaskedCageEdges(worldVerts, edges, mask, buffers.edgeCoords, buffers.edgePairs);
}

/**
 * Appends masked black cage geometry for one brush cage.
 *
 * @param cage Brush cage.
 * @param selection Selection sets, if any.
 * @param buffers Cage buffers.
 */
function appendMaskedBrushCage(
  cage: BrushEditCage,
  selection: TargetSelectionSets | undefined,
  buffers: ComponentCageDrawBuffers,
): void {
  const edges = cage.edges.map((edge) => ({
    packed: packUndirectedEdge(edge.vertexA, edge.vertexB),
    a: edge.vertexA,
    b: edge.vertexB,
  }));
  const faceVertices = new Map<number, number[]>();
  for (const face of cage.faces) {
    faceVertices.set(face.faceIndex, face.vertexIndices.slice());
  }
  const mask = buildDrawMask(selection, edges, faceVertices);
  appendCageVertices(cage.worldPositions, mask.selectedVertices, buffers);
  appendMaskedCageEdges(cage.worldPositions, edges, mask, buffers.edgeCoords, buffers.edgePairs);
}

/** Mask of components that selection draw owns (black cage must skip). */
interface ComponentDrawMask {
  selectedVertices: Set<number>;
  fullEdges: Set<number>;
  halfFromA: Set<number>;
  halfFromB: Set<number>;
}

/**
 * Builds the draw mask for one target from selection sets. Face corners recolor
 * cage points only. Face edges stay on the black cage.
 *
 * @param selection Selection sets.
 * @param edges All undirected edges.
 * @param faceVertexIndices Face index → corner vertex indices.
 * @returns Draw mask.
 */
function buildDrawMask(
  selection: TargetSelectionSets | undefined,
  edges: ReadonlyArray<{ packed: number; a: number; b: number }>,
  faceVertexIndices: ReadonlyMap<number, readonly number[]>,
): ComponentDrawMask {
  const explicitVertices = new Set<number>(selection?.vertices ?? []);
  const selectedEdges = packEdgeKeySet(selection?.edges);
  const fullEdges = new Set<number>(selectedEdges);
  const halfFromA = new Set<number>();
  const halfFromB = new Set<number>();
  classifyHalfEdges(edges, explicitVertices, fullEdges, halfFromA, halfFromB);
  const coloredVertices = new Set<number>(explicitVertices);
  addSelectedFaceVertices(selection, faceVertexIndices, coloredVertices);
  addEdgeEndpointVertices(edges, selectedEdges, coloredVertices);
  return { selectedVertices: coloredVertices, fullEdges, halfFromA, halfFromB };
}

/**
 * Marks every corner of selected faces as selected vertices for cage points.
 *
 * @param selection Selection sets.
 * @param faceVertexIndices Face index → corner vertex indices.
 * @param selectedVertices Output vertex set.
 */
function addSelectedFaceVertices(
  selection: TargetSelectionSets | undefined,
  faceVertexIndices: ReadonlyMap<number, readonly number[]>,
  selectedVertices: Set<number>,
): void {
  if (!selection) {
    return;
  }
  for (const faceIndex of selection.faces) {
    const vertices = faceVertexIndices.get(faceIndex);
    if (!vertices) {
      continue;
    }
    for (const vertexIndex of vertices) {
      selectedVertices.add(vertexIndex);
    }
  }
}

/**
 * Marks endpoints of selected edges as selected vertices for cage point
 * masking.
 *
 * @param selection Selection sets.
 * @param edges All edges.
 * @param selectedVertices Output vertices.
 */
function addEdgeEndpointVertices(
  edges: ReadonlyArray<{ packed: number; a: number; b: number }>,
  selectedEdges: ReadonlySet<number>,
  selectedVertices: Set<number>,
): void {
  for (const edge of edges) {
    if (!selectedEdges.has(edge.packed)) {
      continue;
    }
    selectedVertices.add(edge.a);
    selectedVertices.add(edge.b);
  }
}

/**
 * Packs selected `low:high` edge keys into numeric ids.
 *
 * @param edgeKeys Selected edge keys.
 * @returns Packed ids.
 */
function packEdgeKeySet(edgeKeys: ReadonlySet<string> | undefined): Set<number> {
  const packed = new Set<number>();
  if (!edgeKeys) {
    return packed;
  }
  for (const edgeKey of edgeKeys) {
    packed.add(packStoredEdgeKey(edgeKey));
  }
  return packed;
}

/**
 * Classifies edges that need only one black half-segment under vertex select.
 *
 * @param edges All edges.
 * @param selectedVertices Selected vertices.
 * @param fullEdges Fully owned edges.
 * @param halfFromA Edges whose black remainder starts at a.
 * @param halfFromB Edges whose black remainder starts at b.
 */
function classifyHalfEdges(
  edges: ReadonlyArray<{ packed: number; a: number; b: number }>,
  selectedVertices: Set<number>,
  fullEdges: Set<number>,
  halfFromA: Set<number>,
  halfFromB: Set<number>,
): void {
  for (const edge of edges) {
    if (fullEdges.has(edge.packed)) {
      continue;
    }
    const aSelected = selectedVertices.has(edge.a);
    const bSelected = selectedVertices.has(edge.b);
    if (aSelected && bSelected) {
      fullEdges.add(edge.packed);
      continue;
    }
    if (aSelected && !bSelected) {
      halfFromA.add(edge.packed);
      continue;
    }
    if (bSelected && !aSelected) {
      halfFromB.add(edge.packed);
    }
  }
}

/**
 * Appends every cage vertex with black or white color from selection.
 *
 * @param worldVerts World vertices.
 * @param selectedVertices Selected vertex indices.
 * @param buffers Cage buffers.
 */
function appendCageVertices(
  worldVerts: ReadonlyArray<THREE.Vector3>,
  selectedVertices: Set<number>,
  buffers: ComponentCageDrawBuffers,
): void {
  for (let index = 0; index < worldVerts.length; index++) {
    pushVertex(worldVerts[index], buffers.vertexCoords);
    pushColor(buffers.vertexColors, selectedVertices.has(index) ? EDIT_SELECTED_VERTEX_COLOR : EDIT_CAGE_COLOR);
  }
}

/**
 * Appends black cage edges. Fully selected edges and one-end (gradient)
 * selection edges are skipped entirely so the half-edge shader owns the full
 * segment without a hard midpoint cut.
 *
 * @param worldVerts World vertices.
 * @param edges Edge list.
 * @param mask Draw mask.
 * @param edgeCoords Output.
 */
function appendMaskedCageEdges(
  worldVerts: ReadonlyArray<THREE.Vector3>,
  edges: ReadonlyArray<{ packed: number; a: number; b: number }>,
  mask: ComponentDrawMask,
  edgeCoords: number[],
  edgePairs: number[],
): void {
  for (const edge of edges) {
    if (mask.fullEdges.has(edge.packed)) {
      continue;
    }
    if (mask.halfFromA.has(edge.packed) || mask.halfFromB.has(edge.packed)) {
      continue;
    }
    const a = worldVerts[edge.a];
    const b = worldVerts[edge.b];
    if (!a || !b) {
      continue;
    }
    pushWorldPair(a, b, edgeCoords);
    edgePairs.push(edge.a, edge.b);
  }
}

/**
 * Appends mesh selection draw data.
 *
 * @param source Mesh source.
 * @param selection Selection sets.
 * @param buffers Output buffers.
 */
function appendMeshSelectionDraw(
  source: ComponentCageMeshSource,
  selection: TargetSelectionSets,
  buffers: ComponentSelectionDrawBuffers,
): void {
  source.mesh.updateMatrixWorld(true);
  const worldVerts = collectMeshWorldVertices(source);
  const edges = collectMeshEdges(source.document);
  appendEdgeSelection(worldVerts, edges, selection, buffers);
  appendIncidentHalfAndFullEdges(worldVerts, edges, selection, buffers);
  appendMeshFaceSelection(source, worldVerts, selection, buffers);
}

/**
 * Appends brush selection draw data.
 *
 * @param cage Brush cage.
 * @param selection Selection sets.
 * @param buffers Output buffers.
 */
function appendBrushSelectionDraw(
  cage: BrushEditCage,
  selection: TargetSelectionSets,
  buffers: ComponentSelectionDrawBuffers,
): void {
  const edges = cage.edges.map((edge) => ({
    packed: packUndirectedEdge(edge.vertexA, edge.vertexB),
    a: edge.vertexA,
    b: edge.vertexB,
  }));
  appendBrushEdgeSelection(cage, selection, buffers);
  appendIncidentHalfAndFullEdges(cage.worldPositions, edges, selection, buffers);
  appendBrushFaceSelection(cage, selection, buffers);
}

/**
 * Appends full solid orange edge segments for every edge key in the selection.
 *
 * @param worldVerts World vertices.
 * @param edges Edge list.
 * @param selection Selection sets.
 * @param buffers Output.
 */
function appendEdgeSelection(
  worldVerts: ReadonlyArray<THREE.Vector3>,
  edges: ReadonlyArray<{ packed: number; a: number; b: number }>,
  selection: TargetSelectionSets,
  buffers: ComponentSelectionDrawBuffers,
): void {
  const selectedEdges = packEdgeKeySet(selection.edges);
  for (const edge of edges) {
    if (!selectedEdges.has(edge.packed)) {
      continue;
    }
    pushFullEdge(worldVerts[edge.a], worldVerts[edge.b], buffers);
    buffers.fullEdgePairs.push(edge.a, edge.b);
  }
}

/**
 * Appends full solid orange edge segments for every selected brush edge key.
 *
 * @param cage Brush cage.
 * @param selection Selection sets.
 * @param buffers Output.
 */
function appendBrushEdgeSelection(
  cage: BrushEditCage,
  selection: TargetSelectionSets,
  buffers: ComponentSelectionDrawBuffers,
): void {
  for (const edge of cage.edges) {
    if (!selection.edges.has(edge.edgeKey)) {
      continue;
    }
    pushFullEdge(cage.worldPositions[edge.vertexA], cage.worldPositions[edge.vertexB], buffers);
  }
}

/**
 * Fills selected faces and draws a solid orange outline on explicitly selected
 * faces. The black cage keeps every wire, including that outline.
 *
 * @param source Mesh source.
 * @param worldVerts World vertices.
 * @param selection Selection sets.
 * @param buffers Output.
 */
function appendMeshFaceSelection(
  source: ComponentCageMeshSource,
  worldVerts: ReadonlyArray<THREE.Vector3>,
  selection: TargetSelectionSets,
  buffers: ComponentSelectionDrawBuffers,
): void {
  const faceLoops = collectMeshFaceLoops(source.document);
  const highlighted = collectImpliedAndSelectedFaces(selection, faceLoops);
  for (const faceIndex of highlighted) {
    pushMeshFaceFill(source, faceIndex, buffers.faceCoords, buffers.faceVertexIndices);
    if (selection.faces.has(faceIndex)) {
      appendMeshFaceBoundaryEdges(source, worldVerts, faceIndex, buffers);
    }
  }
}

/**
 * Draws the solid orange outline of one selected mesh face.
 *
 * @param source Mesh source.
 * @param worldVerts World vertices.
 * @param faceIndex Face index.
 * @param buffers Output.
 */
function appendMeshFaceBoundaryEdges(
  source: ComponentCageMeshSource,
  worldVerts: ReadonlyArray<THREE.Vector3>,
  faceIndex: number,
  buffers: ComponentSelectionDrawBuffers,
): void {
  const topology = source.document.getTopology();
  if (!Number.isFinite(faceIndex) || faceIndex < 0 || faceIndex >= topology.getFaceCount()) {
    return;
  }
  for (const halfEdgeIndex of meshTopologyFaceHalfEdgeIndices(topology, faceIndex)) {
    const a = meshTopologyHalfEdgeCornerVertex(topology, halfEdgeIndex);
    const b = meshTopologyHalfEdgeDestinationVertex(topology, halfEdgeIndex);
    pushFullEdge(worldVerts[a], worldVerts[b], buffers);
    buffers.fullEdgePairs.push(a, b);
  }
}

/**
 * Fills selected brush faces and draws a solid orange outline on explicitly
 * selected faces. The black cage keeps every wire.
 *
 * @param cage Brush cage.
 * @param selection Selection sets.
 * @param buffers Output.
 */
function appendBrushFaceSelection(
  cage: BrushEditCage,
  selection: TargetSelectionSets,
  buffers: ComponentSelectionDrawBuffers,
): void {
  const faceLoops = cage.faces.map((face) => ({
    faceIndex: face.faceIndex,
    vertexIndices: face.vertexIndices,
    edgeKeys: buildLoopEdgeKeys(face.vertexIndices),
  }));
  const highlighted = collectImpliedAndSelectedFaces(selection, faceLoops);
  for (const faceIndex of highlighted) {
    const face = cage.faces.find((item) => item.faceIndex === faceIndex);
    if (!face) {
      continue;
    }
    const loop = face.vertexIndices
      .map((index) => cage.worldPositions[index])
      .filter((point): point is THREE.Vector3 => !!point);
    pushPolygonFaceFill(loop, buffers.faceCoords);
    if (selection.faces.has(faceIndex)) {
      appendPolygonBoundaryEdges(loop, buffers);
    }
  }
}

/**
 * Draws the solid orange outline of one polygon loop.
 *
 * @param loop Ordered world vertices.
 * @param buffers Output.
 */
function appendPolygonBoundaryEdges(loop: THREE.Vector3[], buffers: ComponentSelectionDrawBuffers): void {
  if (loop.length < 2) {
    return;
  }
  for (let index = 0; index < loop.length; index++) {
    const a = loop[index];
    const b = loop[(index + 1) % loop.length];
    if (!a || !b) {
      continue;
    }
    pushFullEdge(a, b, buffers);
  }
}

/** Face loop used to detect fully selected faces from verts or edges. */
interface FaceLoopDescriptor {
  faceIndex: number;
  vertexIndices: readonly number[];
  edgeKeys: readonly number[];
}

/**
 * Collects explicit faces plus faces fully covered by selected verts or edges.
 * Edge endpoints alone never imply a face: a partial edge loop that happens to
 * touch every corner (e.g. three edges of a quad) must not fill the face.
 *
 * @param selection Selection sets.
 * @param faceLoops Face loops for the target.
 * @returns Face indices to fill.
 */
function collectImpliedAndSelectedFaces(
  selection: TargetSelectionSets,
  faceLoops: readonly FaceLoopDescriptor[],
): Set<number> {
  const faces = new Set<number>(selection.faces);
  const selectedEdges = packEdgeKeySet(selection.edges);
  for (const face of faceLoops) {
    if (faces.has(face.faceIndex)) {
      continue;
    }
    if (isFaceCoveredBySelection(face, selection.vertices, selectedEdges)) {
      faces.add(face.faceIndex);
    }
  }
  return faces;
}

/**
 * Returns true when the face should fill because every boundary edge is
 * selected, or every loop vertex is selected with no incomplete edge loop.
 *
 * @param face Face loop.
 * @param selectedVertices Explicitly selected vertices (not edge endpoints).
 * @param selectedEdges Selected edge keys.
 * @returns True when the face fill should draw.
 */
function isFaceCoveredBySelection(
  face: FaceLoopDescriptor,
  selectedVertices: Set<number>,
  selectedEdges: Set<number>,
): boolean {
  if (face.edgeKeys.length > 0 && face.edgeKeys.every((edgeKey) => selectedEdges.has(edgeKey))) {
    return true;
  }
  if (face.vertexIndices.length === 0) {
    return false;
  }
  if (!face.vertexIndices.every((vertexIndex) => selectedVertices.has(vertexIndex))) {
    return false;
  }
  return !faceHasPartialEdgeSelection(face, selectedEdges);
}

/**
 * Returns true when some but not all boundary edges of a face are selected.
 *
 * @param face Face loop.
 * @param selectedEdges Selected edge keys.
 * @returns True for an incomplete edge loop.
 */
function faceHasPartialEdgeSelection(face: FaceLoopDescriptor, selectedEdges: Set<number>): boolean {
  let selectedCount = 0;
  for (const edgeKey of face.edgeKeys) {
    if (selectedEdges.has(edgeKey)) {
      selectedCount += 1;
    }
  }
  return selectedCount > 0 && selectedCount < face.edgeKeys.length;
}

/**
 * Collects face loops with edge keys from a mesh document.
 *
 * @param document Mesh document.
 * @returns Face loop descriptors.
 */
function collectMeshFaceLoops(document: MeshDocument): FaceLoopDescriptor[] {
  const generation = document.getTopologyGeneration();
  const cached = meshFaceLoopCache.get(document);
  if (cached && cached.generation === generation) {
    return cached.faces;
  }
  const faces = buildMeshFaceLoops(document);
  meshFaceLoopCache.set(document, { generation, faces });
  return faces;
}

/** Cached face loops for one topology generation. */
interface MeshFaceLoopCacheEntry {
  generation: number;
  faces: FaceLoopDescriptor[];
}

const meshFaceLoopCache = new WeakMap<MeshDocument, MeshFaceLoopCacheEntry>();

/**
 * Builds face loops with packed edge ids.
 *
 * @param document Mesh document.
 * @returns Face loop descriptors.
 */
function buildMeshFaceLoops(document: MeshDocument): FaceLoopDescriptor[] {
  const topology = document.getTopology();
  const faces: FaceLoopDescriptor[] = [];
  const faceCount = topology.getFaceCount();
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
    faces.push(buildOneFaceLoop(topology, faceIndex));
  }
  return faces;
}

/**
 * Builds one face loop.
 *
 * @param topology Mesh topology.
 * @param faceIndex Face index.
 * @returns Face loop descriptor.
 */
function buildOneFaceLoop(topology: ReturnType<MeshDocument['getTopology']>, faceIndex: number): FaceLoopDescriptor {
  const vertexIndices: number[] = [];
  const edgeKeys: number[] = [];
  for (const halfEdgeIndex of meshTopologyFaceHalfEdgeIndices(topology, faceIndex)) {
    const a = meshTopologyHalfEdgeCornerVertex(topology, halfEdgeIndex);
    const b = meshTopologyHalfEdgeDestinationVertex(topology, halfEdgeIndex);
    vertexIndices.push(a);
    edgeKeys.push(packUndirectedEdge(a, b));
  }
  return { faceIndex, vertexIndices, edgeKeys };
}

/**
 * Builds undirected edge keys around an ordered vertex loop.
 *
 * @param vertexIndices Face loop.
 * @returns Edge keys.
 */
function buildLoopEdgeKeys(vertexIndices: readonly number[]): number[] {
  const edgeKeys: number[] = [];
  for (let index = 0; index < vertexIndices.length; index++) {
    const a = vertexIndices[index];
    const b = vertexIndices[(index + 1) % vertexIndices.length];
    if (a === undefined || b === undefined) {
      continue;
    }
    edgeKeys.push(packUndirectedEdge(a, b));
  }
  return edgeKeys;
}

/**
 * Draws full orange edges when both verts are selected, and half gradients when
 * only one end is selected (Blender vertex-select look).
 *
 * @param worldVerts World vertex positions.
 * @param edges Edge list.
 * @param selection Selection sets.
 * @param buffers Output buffers.
 */
function appendIncidentHalfAndFullEdges(
  worldVerts: ReadonlyArray<THREE.Vector3>,
  edges: ReadonlyArray<{ packed: number; a: number; b: number }>,
  selection: TargetSelectionSets,
  buffers: ComponentSelectionDrawBuffers,
): void {
  const drawnFull = packEdgeKeySet(selection.edges);
  for (const edge of edges) {
    if (drawnFull.has(edge.packed)) {
      continue;
    }
    const aSelected = selection.vertices.has(edge.a);
    const bSelected = selection.vertices.has(edge.b);
    if (aSelected && bSelected) {
      pushFullEdge(worldVerts[edge.a], worldVerts[edge.b], buffers);
      buffers.fullEdgePairs.push(edge.a, edge.b);
      drawnFull.add(edge.packed);
      continue;
    }
    if (aSelected && !bSelected) {
      pushHalfGradientEdge(worldVerts[edge.a], worldVerts[edge.b], buffers);
      buffers.halfEdgePairs.push(edge.a, edge.b);
      continue;
    }
    if (bSelected && !aSelected) {
      pushHalfGradientEdge(worldVerts[edge.b], worldVerts[edge.a], buffers);
      buffers.halfEdgePairs.push(edge.b, edge.a);
    }
  }
}

/**
 * Pushes one world-space vertex coordinate triple when the point is defined.
 *
 * @param point World point.
 * @param coords Output coordinate buffer.
 */
function pushVertex(point: THREE.Vector3 | undefined, coords: number[]): void {
  if (!point) {
    return;
  }
  coords.push(point.x, point.y, point.z);
}

/**
 * Pushes a full solid selected edge segment. Color comes from the solid
 * selection line shader.
 *
 * @param a Start.
 * @param b End.
 * @param buffers Output buffers.
 */
function pushFullEdge(
  a: THREE.Vector3 | undefined,
  b: THREE.Vector3 | undefined,
  buffers: ComponentSelectionDrawBuffers,
): void {
  if (!a || !b) {
    return;
  }
  buffers.fullEdgeCoords.push(a.x, a.y, a.z, b.x, b.y, b.z);
}

/**
 * Pushes a full edge with Blender-style vertex-select gradient. fadeT 0 at the
 * selected endpoint (solid orange) and 1 at the unselected endpoint (black in
 * 3D / white in 2D via the half-edge shader).
 *
 * @param selectedEnd Selected endpoint.
 * @param otherEnd Unselected endpoint.
 * @param buffers Output buffers.
 */
function pushHalfGradientEdge(
  selectedEnd: THREE.Vector3 | undefined,
  otherEnd: THREE.Vector3 | undefined,
  buffers: ComponentSelectionDrawBuffers,
): void {
  if (!selectedEnd || !otherEnd) {
    return;
  }
  buffers.halfEdgeCoords.push(selectedEnd.x, selectedEnd.y, selectedEnd.z, otherEnd.x, otherEnd.y, otherEnd.z);
  buffers.halfEdgeFadeT.push(0, 1);
}

/**
 * Pushes two world points as a line segment.
 *
 * @param a First point.
 * @param b Second point.
 * @param coords Output.
 */
function pushWorldPair(a: THREE.Vector3, b: THREE.Vector3, coords: number[]): void {
  coords.push(a.x, a.y, a.z, b.x, b.y, b.z);
}

/**
 * Pushes an RGB color triple (0–1 floats) for vertex colors.
 *
 * @param colors Output color buffer.
 * @param hex Hex color.
 */
function pushColor(colors: number[], hex: number): void {
  colors.push(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
}

/**
 * Ear-clip triangulates a mesh document face into world-space fill triangles.
 *
 * @param source Mesh source.
 * @param faceIndex Face index.
 * @param coords Face triangle output.
 */
function pushMeshFaceFill(
  source: ComponentCageMeshSource,
  faceIndex: number,
  coords: number[],
  faceVertexIndices: number[],
): void {
  const topology = source.document.getTopology();
  if (!Number.isFinite(faceIndex) || faceIndex < 0 || faceIndex >= topology.getFaceCount()) {
    return;
  }
  const loop: THREE.Vector3[] = [];
  const loopIndices: number[] = [];
  const scratch = { 0: 0, 1: 0, 2: 0, length: 3 } as { 0: number; 1: number; 2: number; length: number };
  const positions = topology.getPositions();
  for (const halfEdgeIndex of meshTopologyFaceHalfEdgeIndices(topology, faceIndex)) {
    const vertexIndex = meshTopologyHalfEdgeCornerVertex(topology, halfEdgeIndex);
    meshVertexPositionRead(positions, vertexIndex, scratch);
    loop.push(new THREE.Vector3(scratch[0], scratch[1], scratch[2]).applyMatrix4(source.mesh.matrixWorld));
    loopIndices.push(vertexIndex);
  }
  pushPolygonFaceFill(loop, coords, loopIndices, faceVertexIndices);
}

/**
 * Ear-clip triangulates a polygon into triangle positions. Z-fighting is
 * handled by polygonOffset on the face fill material (same approach as face
 * select).
 *
 * @param loop Ordered world vertices.
 * @param coords Triangle output.
 */
function pushPolygonFaceFill(
  loop: THREE.Vector3[],
  coords: number[],
  loopIndices: readonly number[] = [],
  faceVertexIndices: number[] = [],
): void {
  if (loop.length < 3) {
    return;
  }
  const triangles = triangulateSimplePolygon3d(loop);
  for (let index = 0; index < triangles.length; index += 3) {
    pushTriangleCorner(loop[triangles[index]!], coords);
    pushTriangleCorner(loop[triangles[index + 1]!], coords);
    pushTriangleCorner(loop[triangles[index + 2]!], coords);
    pushFaceVertexIndex(loopIndices, triangles[index], faceVertexIndices);
    pushFaceVertexIndex(loopIndices, triangles[index + 1], faceVertexIndices);
    pushFaceVertexIndex(loopIndices, triangles[index + 2], faceVertexIndices);
  }
}

/**
 * Records one triangulated face corner vertex index.
 *
 * @param loopIndices Loop vertex indices.
 * @param triangleIndex Triangle corner into the loop, if present.
 * @param faceVertexIndices Output vertex indices.
 */
function pushFaceVertexIndex(
  loopIndices: readonly number[],
  triangleIndex: number | undefined,
  faceVertexIndices: number[],
): void {
  if (triangleIndex === undefined) {
    return;
  }
  const vertexIndex = loopIndices[triangleIndex];
  if (vertexIndex !== undefined) {
    faceVertexIndices.push(vertexIndex);
  }
}

/**
 * Pushes one triangle corner into the fill coordinate buffer.
 *
 * @param point World corner.
 * @param coords Output.
 */
function pushTriangleCorner(point: THREE.Vector3 | undefined, coords: number[]): void {
  if (!point) {
    return;
  }
  coords.push(point.x, point.y, point.z);
}
