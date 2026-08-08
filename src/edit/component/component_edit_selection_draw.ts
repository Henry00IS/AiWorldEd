import * as THREE from 'three';
import { Theme } from '@/theme.js';
import type { MeshDocument } from '@/mesh/document/mesh_document.js';
import { meshVertexPositionRead } from '@/mesh/topology/mesh_vertex_position.js';
import {
  meshTopologyFaceHalfEdgeIndices,
  meshTopologyHalfEdgeCornerVertex,
  meshTopologyHalfEdgeDestinationVertex,
} from '@/mesh/topology/mesh_topology_query.js';
import { buildComponentEdgeKey } from './component_selection_entry.js';
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
}

/** Packed selection draw buffers for edges and faces (verts live on the cage). */
export interface ComponentSelectionDrawBuffers {
  fullEdgeCoords: number[];
  halfEdgeCoords: number[];
  /**
   * Per-vertex fade weight for half edges (0 = selected end / solid orange, 1 =
   * fade end). Consumed by the half-edge line shader.
   */
  halfEdgeFadeT: number[];
  faceCoords: number[];
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
    halfEdgeCoords: [],
    halfEdgeFadeT: [],
    faceCoords: [],
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
  const faceEdgeKeys = collectMeshFaceEdgeKeys(source.document);
  const faceVertexIndices = collectMeshFaceVertexIndices(source.document);
  const mask = buildDrawMask(selection, edges, faceEdgeKeys, faceVertexIndices);
  appendCageVertices(worldVerts, mask.selectedVertices, buffers);
  appendMaskedCageEdges(worldVerts, edges, mask, buffers.edgeCoords);
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
    edgeKey: edge.edgeKey,
    a: edge.vertexA,
    b: edge.vertexB,
  }));
  const faceEdges = new Map<number, string[]>();
  const faceVertices = new Map<number, number[]>();
  for (const face of cage.faces) {
    faceEdges.set(face.faceIndex, collectBrushFaceEdgeKeys(face.vertexIndices));
    faceVertices.set(face.faceIndex, face.vertexIndices.slice());
  }
  const mask = buildDrawMask(selection, edges, faceEdges, faceVertices);
  appendCageVertices(cage.worldPositions, mask.selectedVertices, buffers);
  appendMaskedCageEdges(cage.worldPositions, edges, mask, buffers.edgeCoords);
}

/** Mask of components that selection draw owns (black cage must skip). */
interface ComponentDrawMask {
  selectedVertices: Set<number>;
  fullEdges: Set<string>;
  halfFromA: Set<string>;
  halfFromB: Set<string>;
}

/**
 * Builds the draw mask for one target from selection sets.
 *
 * @param selection Selection sets.
 * @param edges All undirected edges.
 * @param faceEdgeKeys Face index → edge keys on that face.
 * @param faceVertexIndices Face index → corner vertex indices.
 * @returns Draw mask.
 */
function buildDrawMask(
  selection: TargetSelectionSets | undefined,
  edges: ReadonlyArray<{ edgeKey: string; a: number; b: number }>,
  faceEdgeKeys: ReadonlyMap<number, readonly string[]>,
  faceVertexIndices: ReadonlyMap<number, readonly number[]>,
): ComponentDrawMask {
  const explicitVertices = new Set<number>(selection?.vertices ?? []);
  addSelectedFaceVertices(selection, faceVertexIndices, explicitVertices);
  const fullEdges = new Set<string>(selection?.edges ?? []);
  addFaceBoundaryEdgesToFullMask(selection, faceEdgeKeys, fullEdges);
  const halfFromA = new Set<string>();
  const halfFromB = new Set<string>();
  classifyHalfEdges(edges, explicitVertices, fullEdges, halfFromA, halfFromB);
  const coloredVertices = new Set<number>(explicitVertices);
  addEdgeEndpointVertices(selection, edges, coloredVertices);
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
 * Marks face-boundary edges as fully owned by selection (skip black cage).
 *
 * @param selection Selection sets.
 * @param faceEdgeKeys Face → edges.
 * @param fullEdges Output full-edge mask.
 */
function addFaceBoundaryEdgesToFullMask(
  selection: TargetSelectionSets | undefined,
  faceEdgeKeys: ReadonlyMap<number, readonly string[]>,
  fullEdges: Set<string>,
): void {
  if (!selection) {
    return;
  }
  for (const faceIndex of selection.faces) {
    const edgeKeys = faceEdgeKeys.get(faceIndex);
    if (!edgeKeys) {
      continue;
    }
    for (const edgeKey of edgeKeys) {
      fullEdges.add(edgeKey);
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
  selection: TargetSelectionSets | undefined,
  edges: ReadonlyArray<{ edgeKey: string; a: number; b: number }>,
  selectedVertices: Set<number>,
): void {
  if (!selection) {
    return;
  }
  for (const edge of edges) {
    if (!selection.edges.has(edge.edgeKey)) {
      continue;
    }
    selectedVertices.add(edge.a);
    selectedVertices.add(edge.b);
  }
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
  edges: ReadonlyArray<{ edgeKey: string; a: number; b: number }>,
  selectedVertices: Set<number>,
  fullEdges: Set<string>,
  halfFromA: Set<string>,
  halfFromB: Set<string>,
): void {
  for (const edge of edges) {
    if (fullEdges.has(edge.edgeKey)) {
      continue;
    }
    const aSelected = selectedVertices.has(edge.a);
    const bSelected = selectedVertices.has(edge.b);
    if (aSelected && bSelected) {
      fullEdges.add(edge.edgeKey);
      continue;
    }
    if (aSelected && !bSelected) {
      halfFromA.add(edge.edgeKey);
      continue;
    }
    if (bSelected && !aSelected) {
      halfFromB.add(edge.edgeKey);
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
 * Appends black cage edges, skipping full selection and drawing only unselected
 * halves for one-end vertex selection.
 *
 * @param worldVerts World vertices.
 * @param edges Edge list.
 * @param mask Draw mask.
 * @param edgeCoords Output.
 */
function appendMaskedCageEdges(
  worldVerts: ReadonlyArray<THREE.Vector3>,
  edges: ReadonlyArray<{ edgeKey: string; a: number; b: number }>,
  mask: ComponentDrawMask,
  edgeCoords: number[],
): void {
  for (const edge of edges) {
    if (mask.fullEdges.has(edge.edgeKey)) {
      continue;
    }
    const a = worldVerts[edge.a];
    const b = worldVerts[edge.b];
    if (!a || !b) {
      continue;
    }
    if (mask.halfFromA.has(edge.edgeKey)) {
      pushWorldPair(midpoint(a, b), b, edgeCoords);
      continue;
    }
    if (mask.halfFromB.has(edge.edgeKey)) {
      pushWorldPair(midpoint(b, a), a, edgeCoords);
      continue;
    }
    pushWorldPair(a, b, edgeCoords);
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
    edgeKey: edge.edgeKey,
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
  edges: ReadonlyArray<{ edgeKey: string; a: number; b: number }>,
  selection: TargetSelectionSets,
  buffers: ComponentSelectionDrawBuffers,
): void {
  for (const edge of edges) {
    if (!selection.edges.has(edge.edgeKey)) {
      continue;
    }
    pushFullEdge(worldVerts[edge.a], worldVerts[edge.b], buffers);
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
 * Draws selected mesh faces as fills plus orange boundary edges. Also fills
 * faces fully covered by selected vertices or edges (Blender-style).
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
    pushMeshFaceFill(source, faceIndex, buffers.faceCoords);
    if (selection.faces.has(faceIndex)) {
      appendMeshFaceBoundaryEdges(source, worldVerts, faceIndex, buffers);
    }
  }
}

/**
 * Draws orange boundary edges for one mesh face.
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
  }
}

/**
 * Draws selected brush faces as fills plus orange boundary edges. Also fills
 * faces fully covered by selected vertices or edges (Blender-style).
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

/** Face loop used to detect fully selected faces from verts or edges. */
interface FaceLoopDescriptor {
  faceIndex: number;
  vertexIndices: readonly number[];
  edgeKeys: readonly string[];
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
  for (const face of faceLoops) {
    if (faces.has(face.faceIndex)) {
      continue;
    }
    if (isFaceCoveredBySelection(face, selection.vertices, selection.edges)) {
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
  selectedEdges: Set<string>,
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
function faceHasPartialEdgeSelection(face: FaceLoopDescriptor, selectedEdges: Set<string>): boolean {
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
  const topology = document.getTopology();
  const faces: FaceLoopDescriptor[] = [];
  const faceCount = topology.getFaceCount();
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
    const vertexIndices: number[] = [];
    const edgeKeys: string[] = [];
    for (const halfEdgeIndex of meshTopologyFaceHalfEdgeIndices(topology, faceIndex)) {
      const a = meshTopologyHalfEdgeCornerVertex(topology, halfEdgeIndex);
      const b = meshTopologyHalfEdgeDestinationVertex(topology, halfEdgeIndex);
      vertexIndices.push(a);
      edgeKeys.push(buildComponentEdgeKey(a, b));
    }
    faces.push({ faceIndex, vertexIndices, edgeKeys });
  }
  return faces;
}

/**
 * Builds undirected edge keys around an ordered vertex loop.
 *
 * @param vertexIndices Face loop.
 * @returns Edge keys.
 */
function buildLoopEdgeKeys(vertexIndices: readonly number[]): string[] {
  const edgeKeys: string[] = [];
  for (let index = 0; index < vertexIndices.length; index++) {
    const a = vertexIndices[index]!;
    const b = vertexIndices[(index + 1) % vertexIndices.length]!;
    edgeKeys.push(buildComponentEdgeKey(a, b));
  }
  return edgeKeys;
}

/**
 * Draws orange boundary edges for a convex polygon loop.
 *
 * @param loop Ordered world vertices.
 * @param buffers Output.
 */
function appendPolygonBoundaryEdges(loop: THREE.Vector3[], buffers: ComponentSelectionDrawBuffers): void {
  if (loop.length < 2) {
    return;
  }
  for (let index = 0; index < loop.length; index++) {
    const a = loop[index]!;
    const b = loop[(index + 1) % loop.length]!;
    pushFullEdge(a, b, buffers);
  }
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
  edges: ReadonlyArray<{ edgeKey: string; a: number; b: number }>,
  selection: TargetSelectionSets,
  buffers: ComponentSelectionDrawBuffers,
): void {
  const drawnFull = new Set<string>(selection.edges);
  for (const edge of edges) {
    if (drawnFull.has(edge.edgeKey)) {
      continue;
    }
    const aSelected = selection.vertices.has(edge.a);
    const bSelected = selection.vertices.has(edge.b);
    if (aSelected && bSelected) {
      pushFullEdge(worldVerts[edge.a], worldVerts[edge.b], buffers);
      drawnFull.add(edge.edgeKey);
      continue;
    }
    if (aSelected && !bSelected) {
      pushHalfGradientEdge(worldVerts[edge.a], worldVerts[edge.b], buffers);
      continue;
    }
    if (bSelected && !aSelected) {
      pushHalfGradientEdge(worldVerts[edge.b], worldVerts[edge.a], buffers);
    }
  }
}

/**
 * Collects undirected edges from a mesh document.
 *
 * @param document Mesh document.
 * @returns Edge list.
 */
function collectMeshEdges(document: MeshDocument): Array<{ edgeKey: string; a: number; b: number }> {
  const topology = document.getTopology();
  const edges: Array<{ edgeKey: string; a: number; b: number }> = [];
  const seen = new Set<string>();
  const faceCount = topology.getFaceCount();
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
    for (const halfEdgeIndex of meshTopologyFaceHalfEdgeIndices(topology, faceIndex)) {
      const a = meshTopologyHalfEdgeCornerVertex(topology, halfEdgeIndex);
      const b = meshTopologyHalfEdgeDestinationVertex(topology, halfEdgeIndex);
      const edgeKey = buildComponentEdgeKey(a, b);
      if (seen.has(edgeKey)) {
        continue;
      }
      seen.add(edgeKey);
      edges.push({ edgeKey, a, b });
    }
  }
  return edges;
}

/**
 * Collects face-index → edge-key lists for a mesh document.
 *
 * @param document Mesh document.
 * @returns Face edge map.
 */
function collectMeshFaceEdgeKeys(document: MeshDocument): Map<number, string[]> {
  const topology = document.getTopology();
  const map = new Map<number, string[]>();
  const faceCount = topology.getFaceCount();
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
    const edgeKeys: string[] = [];
    for (const halfEdgeIndex of meshTopologyFaceHalfEdgeIndices(topology, faceIndex)) {
      const a = meshTopologyHalfEdgeCornerVertex(topology, halfEdgeIndex);
      const b = meshTopologyHalfEdgeDestinationVertex(topology, halfEdgeIndex);
      edgeKeys.push(buildComponentEdgeKey(a, b));
    }
    map.set(faceIndex, edgeKeys);
  }
  return map;
}

/**
 * Collects face-index → corner vertex indices for a mesh document.
 *
 * @param document Mesh document.
 * @returns Face vertex map.
 */
function collectMeshFaceVertexIndices(document: MeshDocument): Map<number, number[]> {
  const topology = document.getTopology();
  const map = new Map<number, number[]>();
  const faceCount = topology.getFaceCount();
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
    const vertices: number[] = [];
    for (const halfEdgeIndex of meshTopologyFaceHalfEdgeIndices(topology, faceIndex)) {
      vertices.push(meshTopologyHalfEdgeCornerVertex(topology, halfEdgeIndex));
    }
    map.set(faceIndex, vertices);
  }
  return map;
}

/**
 * Builds undirected edge keys around a brush face vertex loop.
 *
 * @param vertexIndices Face loop.
 * @returns Edge keys.
 */
function collectBrushFaceEdgeKeys(vertexIndices: readonly number[]): string[] {
  const edgeKeys: string[] = [];
  for (let index = 0; index < vertexIndices.length; index++) {
    const a = vertexIndices[index]!;
    const b = vertexIndices[(index + 1) % vertexIndices.length]!;
    edgeKeys.push(buildComponentEdgeKey(a, b));
  }
  return edgeKeys;
}

/**
 * Collects world-space mesh document vertices.
 *
 * @param source Mesh source.
 * @returns World vertices.
 */
function collectMeshWorldVertices(source: ComponentCageMeshSource): THREE.Vector3[] {
  const positions = source.document.getTopology().getPositions();
  const vertexCount = source.document.getTopology().getVertexCount();
  const scratch = { 0: 0, 1: 0, 2: 0, length: 3 } as { 0: number; 1: number; 2: number; length: number };
  const worldVerts: THREE.Vector3[] = [];
  for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex++) {
    meshVertexPositionRead(positions, vertexIndex, scratch);
    worldVerts.push(new THREE.Vector3(scratch[0], scratch[1], scratch[2]).applyMatrix4(source.mesh.matrixWorld));
  }
  return worldVerts;
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
 * Pushes a half-edge from a selected vertex to the edge midpoint. fadeT 0→1 is
 * consumed by the half-edge shader (orange→black in 3D, orange→white in 2D).
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
  const mid = midpoint(selectedEnd, otherEnd);
  buffers.halfEdgeCoords.push(selectedEnd.x, selectedEnd.y, selectedEnd.z, mid.x, mid.y, mid.z);
  buffers.halfEdgeFadeT.push(0, 1);
}

/**
 * Returns the midpoint between two world points.
 *
 * @param a First point.
 * @param b Second point.
 * @returns Midpoint.
 */
function midpoint(a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3 {
  return a.clone().add(b).multiplyScalar(0.5);
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
function pushMeshFaceFill(source: ComponentCageMeshSource, faceIndex: number, coords: number[]): void {
  const topology = source.document.getTopology();
  if (!Number.isFinite(faceIndex) || faceIndex < 0 || faceIndex >= topology.getFaceCount()) {
    return;
  }
  const loop: THREE.Vector3[] = [];
  const scratch = { 0: 0, 1: 0, 2: 0, length: 3 } as { 0: number; 1: number; 2: number; length: number };
  const positions = topology.getPositions();
  for (const halfEdgeIndex of meshTopologyFaceHalfEdgeIndices(topology, faceIndex)) {
    const vertexIndex = meshTopologyHalfEdgeCornerVertex(topology, halfEdgeIndex);
    meshVertexPositionRead(positions, vertexIndex, scratch);
    loop.push(new THREE.Vector3(scratch[0], scratch[1], scratch[2]).applyMatrix4(source.mesh.matrixWorld));
  }
  pushPolygonFaceFill(loop, coords);
}

/**
 * Ear-clip triangulates a polygon into triangle positions. Z-fighting is
 * handled by polygonOffset on the face fill material (same approach as face
 * select).
 *
 * @param loop Ordered world vertices.
 * @param coords Triangle output.
 */
function pushPolygonFaceFill(loop: THREE.Vector3[], coords: number[]): void {
  if (loop.length < 3) {
    return;
  }
  const triangles = triangulateSimplePolygon3d(loop);
  for (let index = 0; index < triangles.length; index += 3) {
    pushTriangleCorner(loop[triangles[index]!], coords);
    pushTriangleCorner(loop[triangles[index + 1]!], coords);
    pushTriangleCorner(loop[triangles[index + 2]!], coords);
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
