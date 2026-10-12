import { compactTopologyWorkingGeometry } from './topology_working_compact.js';
import { topologyWorkingFaceEdgeCornerIndex } from './topology_working_face_edge_index.js';
import type { TopologyWorkingFace } from './topology_working_face.js';
import type { TopologyWorkingGeometry } from './topology_working_geometry.js';
import {
  topologyOperatorApplied,
  topologyOperatorRefused,
  type TopologyOperatorResult,
} from './topology_operator_result.js';

/**
 * Deletes vertices and every face that uses them. Surviving faces stay as they
 * were.
 *
 * @param geometry Working geometry mutated in place.
 * @param vertexIndices Vertices to remove.
 * @returns Operator result.
 */
export function deleteTopologyWorkingVertices(
  geometry: TopologyWorkingGeometry,
  vertexIndices: readonly number[],
): TopologyOperatorResult {
  if (vertexIndices.length === 0) {
    return topologyOperatorRefused('Select vertices to delete');
  }
  const remove = new Set(vertexIndices);
  const remaining = geometry.faces.filter((face) => !faceUsesRemovedVertex(face, remove));
  if (remaining.length === geometry.faces.length) {
    return topologyOperatorRefused('Those vertices are not on a face');
  }
  if (remaining.length === 0) {
    return topologyOperatorRefused('Delete would remove every face');
  }
  geometry.faces = remaining;
  compactTopologyWorkingGeometry(geometry);
  return topologyOperatorApplied();
}

/**
 * Deletes edges by removing every face that uses them. Vertices that still
 * belong to a remaining face stay.
 *
 * @param geometry Working geometry mutated in place.
 * @param edges Selected edges.
 * @returns Operator result.
 */
export function deleteTopologyWorkingEdges(
  geometry: TopologyWorkingGeometry,
  edges: ReadonlyArray<{ vertexA: number; vertexB: number }>,
): TopologyOperatorResult {
  if (edges.length === 0) {
    return topologyOperatorRefused('Select edges to delete');
  }
  const remaining = geometry.faces.filter((face) => !faceUsesSelectedEdge(face, edges));
  if (remaining.length === geometry.faces.length) {
    return topologyOperatorRefused('Those edges are not on a face');
  }
  if (remaining.length === 0) {
    return topologyOperatorRefused('Delete would remove every face');
  }
  geometry.faces = remaining;
  compactTopologyWorkingGeometry(geometry);
  return topologyOperatorApplied();
}

/**
 * Returns whether a face contains one of the edges being deleted.
 *
 * @param face Face to test.
 * @param edges Edges being deleted.
 * @returns True when the face must be removed.
 */
function faceUsesSelectedEdge(
  face: TopologyWorkingFace,
  edges: ReadonlyArray<{ vertexA: number; vertexB: number }>,
): boolean {
  for (const edge of edges) {
    if (topologyWorkingFaceEdgeCornerIndex(face, edge.vertexA, edge.vertexB) >= 0) {
      return true;
    }
  }
  return false;
}

/**
 * Deletes faces. Vertices that no face still uses are dropped.
 *
 * @param geometry Working geometry mutated in place.
 * @param faceIndices Faces to remove.
 * @returns Operator result.
 */
export function deleteTopologyWorkingFaces(
  geometry: TopologyWorkingGeometry,
  faceIndices: readonly number[],
): TopologyOperatorResult {
  if (faceIndices.length === 0) {
    return topologyOperatorRefused('Select faces to delete');
  }
  const remove = new Set(faceIndices);
  const remaining = geometry.faces.filter((_face, index) => !remove.has(index));
  if (remaining.length === geometry.faces.length) {
    return topologyOperatorRefused('Those faces are not on the mesh');
  }
  if (remaining.length === 0) {
    return topologyOperatorRefused('Delete would remove every face');
  }
  geometry.faces = remaining;
  compactTopologyWorkingGeometry(geometry);
  return topologyOperatorApplied();
}

/**
 * Returns whether a face uses a vertex marked for deletion.
 *
 * @param face Face to test.
 * @param remove Vertices being deleted.
 * @returns True when the face must be removed.
 */
function faceUsesRemovedVertex(face: TopologyWorkingFace, remove: ReadonlySet<number>): boolean {
  for (const vertexIndex of face.vertexIndices) {
    if (remove.has(vertexIndex)) {
      return true;
    }
  }
  return false;
}
