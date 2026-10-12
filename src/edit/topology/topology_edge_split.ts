import * as THREE from 'three';
import { TOPOLOGY_EDGE_SPLIT_PARAMETER_EPSILON } from './topology_epsilon.js';
import { topologyWorkingFaceEdgeCornerIndex } from './topology_working_face_edge_index.js';
import type { TopologyWorkingFace } from './topology_working_face.js';
import type { TopologyWorkingGeometry } from './topology_working_geometry.js';
import { topologyWorkingVertexRead } from './topology_working_vertex_read.js';

/** Result of inserting a vertex on an edge. */
export interface TopologyEdgeSplitResult {
  /** Index of the inserted vertex. */
  newVertexIndex: number;
}

/**
 * Inserts a vertex on an undirected edge at parameter t and updates both faces.
 *
 * @param geometry Working geometry mutated in place.
 * @param vertexA First endpoint.
 * @param vertexB Second endpoint.
 * @param parameter Interpolation t in (0, 1).
 * @returns Split result, or null when the split is refused.
 */
export function splitTopologyWorkingEdge(
  geometry: TopologyWorkingGeometry,
  vertexA: number,
  vertexB: number,
  parameter: number,
): TopologyEdgeSplitResult | null {
  if (!isSplitParameterInterior(parameter)) {
    return null;
  }
  const newPosition = interpolateEdgePosition(geometry, vertexA, vertexB, parameter);
  if (!newPosition) {
    return null;
  }
  const newVertexIndex = geometry.positions.length;
  geometry.positions.push(newPosition);
  insertVertexOnMatchingFaces(geometry, vertexA, vertexB, newVertexIndex, parameter);
  return { newVertexIndex };
}

/**
 * Returns whether a split parameter sits strictly inside an edge.
 *
 * @param parameter Interpolation t.
 * @returns True when the parameter is safely interior.
 */
export function isSplitParameterInterior(parameter: number): boolean {
  if (!Number.isFinite(parameter)) {
    return false;
  }
  if (parameter <= TOPOLOGY_EDGE_SPLIT_PARAMETER_EPSILON) {
    return false;
  }
  return parameter < 1 - TOPOLOGY_EDGE_SPLIT_PARAMETER_EPSILON;
}

/**
 * Interpolates a point along an existing edge.
 *
 * @param geometry Working geometry.
 * @param vertexA First endpoint.
 * @param vertexB Second endpoint.
 * @param parameter Interpolation t.
 * @returns New position, or null when an endpoint is missing.
 */
function interpolateEdgePosition(
  geometry: TopologyWorkingGeometry,
  vertexA: number,
  vertexB: number,
  parameter: number,
): THREE.Vector3 | null {
  const start = topologyWorkingVertexRead(geometry, vertexA);
  const end = topologyWorkingVertexRead(geometry, vertexB);
  if (!start || !end) {
    return null;
  }
  return start.clone().lerp(end, parameter);
}

/**
 * Inserts the new vertex into every face that contains the edge.
 *
 * @param geometry Working geometry.
 * @param vertexA First endpoint.
 * @param vertexB Second endpoint.
 * @param newVertexIndex Inserted vertex.
 * @param parameter Interpolation t for UV lerp.
 */
function insertVertexOnMatchingFaces(
  geometry: TopologyWorkingGeometry,
  vertexA: number,
  vertexB: number,
  newVertexIndex: number,
  parameter: number,
): void {
  for (const face of geometry.faces) {
    insertVertexOnFaceEdge(face, vertexA, vertexB, newVertexIndex, parameter);
  }
}

/**
 * Inserts a vertex after the matching corner of one face.
 *
 * @param face Face to update.
 * @param vertexA First endpoint.
 * @param vertexB Second endpoint.
 * @param newVertexIndex Inserted vertex.
 * @param parameter Interpolation t for UV lerp.
 */
function insertVertexOnFaceEdge(
  face: TopologyWorkingFace,
  vertexA: number,
  vertexB: number,
  newVertexIndex: number,
  parameter: number,
): void {
  const corner = topologyWorkingFaceEdgeCornerIndex(face, vertexA, vertexB);
  if (corner < 0) {
    return;
  }
  const nextCorner = (corner + 1) % face.vertexIndices.length;
  const faceParameter = parameterAlongFaceEdge(face, corner, vertexA, parameter);
  const uv = interpolateFaceCornerUv(face, corner, nextCorner, faceParameter);
  face.vertexIndices.splice(corner + 1, 0, newVertexIndex);
  face.cornerUvs.splice(corner + 1, 0, uv);
}

/**
 * Maps an undirected A→B parameter onto the face edge direction.
 *
 * @param face Face that contains the edge.
 * @param corner Corner where the face edge starts.
 * @param vertexA Undirected endpoint the parameter starts at.
 * @param parameter Interpolation t along A→B.
 * @returns Parameter along the face edge from its first corner.
 */
function parameterAlongFaceEdge(face: TopologyWorkingFace, corner: number, vertexA: number, parameter: number): number {
  if (face.vertexIndices[corner] === vertexA) {
    return parameter;
  }
  return 1 - parameter;
}

/**
 * Interpolates a corner UV between two face corners.
 *
 * @param face Face owning the corners.
 * @param corner Start corner index.
 * @param nextCorner End corner index.
 * @param parameter Interpolation t.
 * @returns Interpolated UV.
 */
function interpolateFaceCornerUv(
  face: TopologyWorkingFace,
  corner: number,
  nextCorner: number,
  parameter: number,
): { u: number; v: number } {
  const start = face.cornerUvs[corner];
  const end = face.cornerUvs[nextCorner];
  if (!start || !end) {
    return { u: 0, v: 0 };
  }
  return {
    u: start.u + (end.u - start.u) * parameter,
    v: start.v + (end.v - start.v) * parameter,
  };
}
