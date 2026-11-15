import type { TopologyEdgeEndpoints } from './topology_edge_subdivide.js';
import { topologyFaceAreaVector } from './topology_face_region.js';
import {
  topologyOperatorApplied,
  topologyOperatorRefused,
  type TopologyOperatorResult,
} from './topology_operator_result.js';
import type { TopologyWorkingFace } from './topology_working_face.js';
import type { TopologyWorkingGeometry } from './topology_working_geometry.js';

/** Outcome of turning edges, with the edges that replaced them. */
export interface TopologyEdgeRotateOutcome {
  /** Whether anything changed, and why not. */
  result: TopologyOperatorResult;
  /** Turned edges as vertex pairs. */
  edges: Array<[number, number]>;
}

/**
 * Turns each edge between two faces one corner onward inside the outline the
 * two faces share, so a quad split corner to corner gets the other diagonal.
 * Both faces keep their indices, corner counts and corner UVs. A turn that
 * would fold a face over is skipped.
 *
 * @param geometry Working geometry mutated in place.
 * @param edges Edges to turn.
 * @returns Outcome with the turned edges.
 */
export function rotateTopologyWorkingEdges(
  geometry: TopologyWorkingGeometry,
  edges: readonly TopologyEdgeEndpoints[],
): TopologyEdgeRotateOutcome {
  const turned: Array<[number, number]> = [];
  for (const { vertexA, vertexB } of edges) {
    const edge = rotateTopologyWorkingEdge(geometry, vertexA, vertexB);
    if (edge) turned.push(edge);
  }
  if (turned.length === 0) {
    return { result: topologyOperatorRefused('Rotate Edges needs edges between two faces that can turn'), edges: [] };
  }
  return { result: topologyOperatorApplied(`Rotated ${turned.length} edge(s)`), edges: turned };
}

/**
 * Turns one edge, or leaves the geometry untouched when it cannot.
 *
 * @param geometry Working geometry mutated in place.
 * @param vertexA One endpoint.
 * @param vertexB Other endpoint.
 * @returns New edge, or null when nothing changed.
 */
function rotateTopologyWorkingEdge(
  geometry: TopologyWorkingGeometry,
  vertexA: number,
  vertexB: number,
): [number, number] | null {
  const front = findDirectedEdgeFace(geometry, vertexA, vertexB) ?? findDirectedEdgeFace(geometry, vertexB, vertexA);
  if (front === null) return null;
  const first = geometry.faces[front]!;
  const start = first.vertexIndices.includes(vertexA) && nextCorner(first, vertexA) === vertexB ? vertexB : vertexA;
  const end = start === vertexA ? vertexB : vertexA;
  const back = findDirectedEdgeFace(geometry, start, end);
  if (back === null || back === front) return null;
  const outline = [...rotateCornersTo(first, start), ...rotateCornersTo(geometry.faces[back]!, end).slice(1, -1)];
  const split = first.vertexIndices.length;
  const newFront = outline.slice(1, split + 1);
  const newBack = [...outline.slice(split), ...outline.slice(0, 2)];
  return applyTurn(geometry, front, back, newFront, newBack);
}

/**
 * Rewrites both faces with their new corners when neither folds over and the
 * new edge is not already there.
 *
 * @param geometry Working geometry mutated in place.
 * @param front Index of the first face.
 * @param back Index of the second face.
 * @param frontLoop New corners of the first face.
 * @param backLoop New corners of the second face.
 * @returns New edge, or null when the turn is refused.
 */
function applyTurn(
  geometry: TopologyWorkingGeometry,
  front: number,
  back: number,
  frontLoop: number[],
  backLoop: number[],
): [number, number] | null {
  const edge: [number, number] = [frontLoop[0]!, frontLoop[frontLoop.length - 1]!];
  if (edge[0] === edge[1] || edgeExists(geometry, edge[0], edge[1])) return null;
  const before = topologyFaceAreaVector(geometry, front).add(topologyFaceAreaVector(geometry, back));
  const uvs = collectCornerUvs([geometry.faces[back]!, geometry.faces[front]!]);
  const old = [geometry.faces[front]!, geometry.faces[back]!];
  geometry.faces[front] = rebuiltFace(old[0]!, frontLoop, uvs);
  geometry.faces[back] = rebuiltFace(old[1]!, backLoop, uvs);
  const folded = [front, back].some((face) => topologyFaceAreaVector(geometry, face).dot(before) <= 1e-12);
  if (!folded) return edge;
  geometry.faces[front] = old[0]!;
  geometry.faces[back] = old[1]!;
  return null;
}

/**
 * Finds the face that walks from one vertex straight to another.
 *
 * @param geometry Working geometry.
 * @param from Edge start.
 * @param to Edge end.
 * @returns Face index, or null.
 */
function findDirectedEdgeFace(geometry: TopologyWorkingGeometry, from: number, to: number): number | null {
  const index = geometry.faces.findIndex((face) => face.vertexIndices.includes(from) && nextCorner(face, from) === to);
  return index < 0 ? null : index;
}

/**
 * Returns whether any face already has an edge between two vertices.
 *
 * @param geometry Working geometry.
 * @param vertexA One endpoint.
 * @param vertexB Other endpoint.
 * @returns True when the edge exists.
 */
function edgeExists(geometry: TopologyWorkingGeometry, vertexA: number, vertexB: number): boolean {
  return (
    findDirectedEdgeFace(geometry, vertexA, vertexB) !== null ||
    findDirectedEdgeFace(geometry, vertexB, vertexA) !== null
  );
}

/**
 * Returns the corner after a vertex in a face's winding.
 *
 * @param face Face.
 * @param vertex Corner vertex.
 * @returns Next corner vertex.
 */
function nextCorner(face: TopologyWorkingFace, vertex: number): number {
  const loop = face.vertexIndices;
  return loop[(loop.indexOf(vertex) + 1) % loop.length]!;
}

/**
 * Lists a face's corners starting at a vertex, in winding order.
 *
 * @param face Face.
 * @param vertex First corner.
 * @returns Rotated corners.
 */
function rotateCornersTo(face: TopologyWorkingFace, vertex: number): number[] {
  const corner = face.vertexIndices.indexOf(vertex);
  return [...face.vertexIndices.slice(corner), ...face.vertexIndices.slice(0, corner)];
}

/**
 * Maps each corner vertex to its UV; later faces win on shared corners.
 *
 * @param faces Faces to read.
 * @returns UVs by vertex.
 */
function collectCornerUvs(faces: readonly TopologyWorkingFace[]): Map<number, { u: number; v: number }> {
  const uvs = new Map<number, { u: number; v: number }>();
  for (const face of faces) face.vertexIndices.forEach((vertex, corner) => uvs.set(vertex, face.cornerUvs[corner]!));
  return uvs;
}

/**
 * Builds a face with new corners and the UVs those corners had.
 *
 * @param source Face whose texture is kept.
 * @param loop New corners.
 * @param uvs UVs by vertex.
 * @returns New face.
 */
function rebuiltFace(
  source: TopologyWorkingFace,
  loop: number[],
  uvs: Map<number, { u: number; v: number }>,
): TopologyWorkingFace {
  const cornerUvs = loop.map((vertex) => ({ ...(uvs.get(vertex) ?? { u: 0, v: 0 }) }));
  return { ...source, vertexIndices: loop, cornerUvs };
}
