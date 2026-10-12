import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import { refitPlanarWorkingFaceCornerUvs } from './topology_edge_dissolve_face_uv.js';
import { joinWorkingFacesAcrossEdge } from './topology_edge_dissolve.js';
import { collectTopologyWorkingEdges } from './topology_working_edges_collect.js';
import { compactTopologyWorkingGeometry } from './topology_working_compact.js';
import type { TopologyWorkingFace } from './topology_working_face.js';
import {
  assignTopologyWorkingGeometry,
  cloneTopologyWorkingGeometry,
  type TopologyWorkingGeometry,
} from './topology_working_geometry.js';
import { workingGeometryToBrush } from './topology_working_from_brush.js';
import { dissolveTopologyWorkingVertex } from './topology_vertex_dissolve.js';
import {
  topologyOperatorApplied,
  topologyOperatorRefused,
  type TopologyOperatorResult,
} from './topology_operator_result.js';

/** Undirected edge whose endpoints are both selected. */
interface SelectedEdge {
  vertexA: number;
  vertexB: number;
}

/**
 * Dissolves a set of vertices. Vertices joined by selected edges are removed
 * from the merged faces. Vertices with no selected edge use a neighbor cap.
 *
 * @param geometry Working geometry mutated in place.
 * @param vertexIndices Vertices to dissolve.
 * @param requireSolidRemainder When true, refuse a result that is not a valid
 *   brush.
 * @returns Operator result.
 */
export function dissolveTopologyWorkingVertices(
  geometry: TopologyWorkingGeometry,
  vertexIndices: readonly number[],
  requireSolidRemainder: boolean,
): TopologyOperatorResult {
  const selected = uniqueVertexIndices(vertexIndices);
  if (selected.length === 0) {
    return topologyOperatorRefused('Select vertices to dissolve');
  }
  const internalEdges = collectEdgesInsideSelection(geometry, selected);
  if (internalEdges.length === 0) {
    return dissolveIsolatedVertices(geometry, selected, requireSolidRemainder);
  }
  return dissolveVerticesAcrossEdges(geometry, selected, internalEdges, requireSolidRemainder);
}

/**
 * Joins faces across selected edges, then removes those endpoints.
 *
 * @param geometry Working geometry.
 * @param selected Vertices to dissolve.
 * @param internalEdges Edges with both ends selected.
 * @param requireSolidRemainder Brush validity guard.
 * @returns Operator result.
 */
function dissolveVerticesAcrossEdges(
  geometry: TopologyWorkingGeometry,
  selected: readonly number[],
  internalEdges: readonly SelectedEdge[],
  requireSolidRemainder: boolean,
): TopologyOperatorResult {
  const snapshot = cloneTopologyWorkingGeometry(geometry);
  const joined = joinSelectedEdges(geometry, internalEdges);
  const touched = collectFacesTouchingVertices(geometry, joined);
  stripVerticesFromFaces(geometry, joined);
  refitTouchedPlanarFaces(geometry, touched);
  const leftovers = dissolveLeftoverVertices(geometry, selected, joined, requireSolidRemainder);
  if (!leftovers.applied) {
    restoreWorkingGeometry(geometry, snapshot);
    return leftovers;
  }
  compactTopologyWorkingGeometry(geometry);
  if (requireSolidRemainder && !brushRemainderIsValid(geometry)) {
    restoreWorkingGeometry(geometry, snapshot);
    return topologyOperatorRefused('Dissolving those vertices would leave an invalid brush');
  }
  return topologyOperatorApplied();
}

/**
 * Joins every selected edge that still has two faces.
 *
 * @param geometry Working geometry.
 * @param internalEdges Edges inside the selection.
 * @returns Endpoints of edges that joined.
 */
function joinSelectedEdges(geometry: TopologyWorkingGeometry, internalEdges: readonly SelectedEdge[]): Set<number> {
  const joined = new Set<number>();
  for (const edge of internalEdges) {
    if (!joinWorkingFacesAcrossEdge(geometry, edge.vertexA, edge.vertexB)) {
      continue;
    }
    joined.add(edge.vertexA);
    joined.add(edge.vertexB);
  }
  return joined;
}

/**
 * Dissolves selected vertices that were not removed by an edge join.
 *
 * @param geometry Working geometry.
 * @param selected Vertices to dissolve.
 * @param joined Endpoints already stripped.
 * @param requireSolidRemainder Brush remainder guard.
 * @returns Operator result. Applied when there is nothing left to dissolve.
 */
function dissolveLeftoverVertices(
  geometry: TopologyWorkingGeometry,
  selected: readonly number[],
  joined: ReadonlySet<number>,
  requireSolidRemainder: boolean,
): TopologyOperatorResult {
  const leftovers = selected.filter((vertexIndex) => !joined.has(vertexIndex));
  if (leftovers.length === 0) {
    return topologyOperatorApplied();
  }
  return dissolveIsolatedVertices(geometry, leftovers, requireSolidRemainder);
}

/**
 * Dissolves vertices that do not share a selected edge, highest index first.
 *
 * @param geometry Working geometry.
 * @param vertexIndices Vertices to dissolve.
 * @param requireSolidRemainder Brush remainder guard.
 * @returns Operator result.
 */
function dissolveIsolatedVertices(
  geometry: TopologyWorkingGeometry,
  vertexIndices: readonly number[],
  requireSolidRemainder: boolean,
): TopologyOperatorResult {
  const sorted = vertexIndices.slice().sort((left, right) => right - left);
  let appliedAny = false;
  let lastMessage = '';
  for (const vertexIndex of sorted) {
    const result = dissolveTopologyWorkingVertex(geometry, vertexIndex, requireSolidRemainder);
    appliedAny = appliedAny || result.applied;
    lastMessage = result.message || lastMessage;
  }
  if (!appliedAny) {
    return topologyOperatorRefused(lastMessage || 'Cannot dissolve the selected vertices');
  }
  return topologyOperatorApplied(lastMessage);
}

/**
 * Collects undirected edges whose endpoints are both selected.
 *
 * @param geometry Working geometry.
 * @param selected Selected vertex indices.
 * @returns Interior edges.
 */
function collectEdgesInsideSelection(geometry: TopologyWorkingGeometry, selected: readonly number[]): SelectedEdge[] {
  const selectedSet = new Set(selected);
  const edges: SelectedEdge[] = [];
  for (const edge of collectTopologyWorkingEdges(geometry)) {
    if (!selectedSet.has(edge.vertexA) || !selectedSet.has(edge.vertexB)) {
      continue;
    }
    edges.push({ vertexA: edge.vertexA, vertexB: edge.vertexB });
  }
  return edges;
}

/**
 * Collects faces that still use one of the joined vertices.
 *
 * @param geometry Working geometry.
 * @param vertices Joined endpoints.
 * @returns Faces whose corners will change.
 */
function collectFacesTouchingVertices(
  geometry: TopologyWorkingGeometry,
  vertices: ReadonlySet<number>,
): TopologyWorkingFace[] {
  const faces: TopologyWorkingFace[] = [];
  for (const face of geometry.faces) {
    if (faceTouchesVertexSet(face, vertices)) {
      faces.push(face);
    }
  }
  return faces;
}

/**
 * Returns whether a face uses any vertex in a set.
 *
 * @param face Face to test.
 * @param vertices Vertex set.
 * @returns True when one corner is in the set.
 */
function faceTouchesVertexSet(face: TopologyWorkingFace, vertices: ReadonlySet<number>): boolean {
  for (const vertexIndex of face.vertexIndices) {
    if (vertices.has(vertexIndex)) {
      return true;
    }
  }
  return false;
}

/**
 * Rewrites planar corner UVs on faces that lost dissolved vertices.
 *
 * @param geometry Working geometry.
 * @param touched Faces collected before the vertices were removed.
 */
function refitTouchedPlanarFaces(geometry: TopologyWorkingGeometry, touched: readonly TopologyWorkingFace[]): void {
  for (const face of touched) {
    if (geometry.faces.includes(face)) {
      refitPlanarWorkingFaceCornerUvs(geometry, face);
    }
  }
}

/**
 * Removes joined endpoints from every face and drops degenerate faces.
 *
 * @param geometry Working geometry.
 * @param vertices Vertices to strip.
 */
function stripVerticesFromFaces(geometry: TopologyWorkingGeometry, vertices: ReadonlySet<number>): void {
  for (const face of geometry.faces) {
    stripFaceVertices(face, vertices);
    collapseConsecutiveCorners(face);
  }
  geometry.faces = geometry.faces.filter((face) => face.vertexIndices.length >= 3);
}

/**
 * Copies face corners that are not in the stripped set.
 *
 * @param face Face to update.
 * @param vertices Vertices to remove.
 */
function stripFaceVertices(face: TopologyWorkingFace, vertices: ReadonlySet<number>): void {
  const vertexIndices: number[] = [];
  const cornerUvs: Array<{ u: number; v: number }> = [];
  for (let corner = 0; corner < face.vertexIndices.length; corner++) {
    appendKeptCorner(face, corner, vertices, vertexIndices, cornerUvs);
  }
  face.vertexIndices = vertexIndices;
  face.cornerUvs = cornerUvs;
}

/**
 * Appends one corner when its vertex is kept.
 *
 * @param face Source face.
 * @param corner Corner index.
 * @param vertices Vertices to remove.
 * @param vertexIndices Destination vertex list.
 * @param cornerUvs Destination UV list.
 */
function appendKeptCorner(
  face: TopologyWorkingFace,
  corner: number,
  vertices: ReadonlySet<number>,
  vertexIndices: number[],
  cornerUvs: Array<{ u: number; v: number }>,
): void {
  const vertexIndex = face.vertexIndices[corner];
  if (vertexIndex === undefined || vertices.has(vertexIndex)) {
    return;
  }
  const uv = face.cornerUvs[corner];
  vertexIndices.push(vertexIndex);
  cornerUvs.push(uv ? { u: uv.u, v: uv.v } : { u: 0, v: 0 });
}

/**
 * Removes consecutive repeated corners, including a repeated closing corner.
 *
 * @param face Face to update.
 */
function collapseConsecutiveCorners(face: TopologyWorkingFace): void {
  const vertexIndices: number[] = [];
  const cornerUvs: Array<{ u: number; v: number }> = [];
  for (let corner = 0; corner < face.vertexIndices.length; corner++) {
    appendNonRepeatingCorner(face, corner, vertexIndices, cornerUvs);
  }
  dropClosingDuplicate(vertexIndices, cornerUvs);
  face.vertexIndices = vertexIndices;
  face.cornerUvs = cornerUvs;
}

/**
 * Appends a corner when it differs from the previous kept corner.
 *
 * @param face Source face.
 * @param corner Corner index.
 * @param vertexIndices Destination vertex list.
 * @param cornerUvs Destination UV list.
 */
function appendNonRepeatingCorner(
  face: TopologyWorkingFace,
  corner: number,
  vertexIndices: number[],
  cornerUvs: Array<{ u: number; v: number }>,
): void {
  const vertexIndex = face.vertexIndices[corner];
  if (vertexIndex === undefined || vertexIndex === vertexIndices[vertexIndices.length - 1]) {
    return;
  }
  const uv = face.cornerUvs[corner];
  vertexIndices.push(vertexIndex);
  cornerUvs.push(uv ? { u: uv.u, v: uv.v } : { u: 0, v: 0 });
}

/**
 * Drops the last corner when it repeats the first.
 *
 * @param vertexIndices Corner vertices.
 * @param cornerUvs Corner UVs aligned with the vertices.
 */
function dropClosingDuplicate(vertexIndices: number[], cornerUvs: Array<{ u: number; v: number }>): void {
  if (vertexIndices.length < 2 || vertexIndices[0] !== vertexIndices[vertexIndices.length - 1]) {
    return;
  }
  vertexIndices.pop();
  cornerUvs.pop();
}

/**
 * Returns whether the geometry rebuilds as a valid solid brush.
 *
 * @param geometry Working geometry.
 * @returns True when the brush validates.
 */
function brushRemainderIsValid(geometry: TopologyWorkingGeometry): boolean {
  const brush = workingGeometryToBrush(geometry);
  if (!brush) {
    return false;
  }
  return SolidBrushValidator.validate(brush).valid;
}

/**
 * Copies a snapshot back onto working geometry.
 *
 * @param geometry Geometry to restore.
 * @param snapshot Snapshot taken before the dissolve.
 */
function restoreWorkingGeometry(geometry: TopologyWorkingGeometry, snapshot: TopologyWorkingGeometry): void {
  assignTopologyWorkingGeometry(geometry, snapshot);
}

/**
 * Returns unique finite vertex indices in input order.
 *
 * @param vertexIndices Candidate indices.
 * @returns Unique indices.
 */
function uniqueVertexIndices(vertexIndices: readonly number[]): number[] {
  const unique: number[] = [];
  const seen = new Set<number>();
  for (const vertexIndex of vertexIndices) {
    if (!Number.isFinite(vertexIndex) || seen.has(vertexIndex)) {
      continue;
    }
    seen.add(vertexIndex);
    unique.push(vertexIndex);
  }
  return unique;
}
