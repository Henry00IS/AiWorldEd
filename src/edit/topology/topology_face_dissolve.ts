import { dissolveTopologyWorkingEdge } from './topology_edge_dissolve.js';
import { topologyWorkingFaceEdgeCornerIndex } from './topology_working_face_edge_index.js';
import type { TopologyWorkingFace } from './topology_working_face.js';
import type { TopologyWorkingGeometry } from './topology_working_geometry.js';
import { topologyOperatorRefused, type TopologyOperatorResult } from './topology_operator_result.js';

/**
 * Dissolves the shared edge between two selected faces.
 *
 * @param geometry Working geometry mutated in place.
 * @param faceIndices Selected face indices.
 * @param requirePlanarUnion When true, refuse a non-planar union.
 * @returns Operator result.
 */
export function dissolveTopologyWorkingFaces(
  geometry: TopologyWorkingGeometry,
  faceIndices: readonly number[],
  requirePlanarUnion: boolean,
): TopologyOperatorResult {
  if (faceIndices.length !== 2) {
    return topologyOperatorRefused('Select two adjacent faces to dissolve');
  }
  const first = geometry.faces[faceIndices[0] ?? -1];
  const second = geometry.faces[faceIndices[1] ?? -1];
  if (!first || !second) {
    return topologyOperatorRefused('Face selection is no longer valid');
  }
  const shared = findSharedEdgeOfFaces(first, second);
  if (!shared) {
    return topologyOperatorRefused('Selected faces do not share an edge');
  }
  return dissolveTopologyWorkingEdge(geometry, shared.vertexA, shared.vertexB, requirePlanarUnion);
}

/**
 * Finds an undirected edge shared by two faces.
 *
 * @param first First face.
 * @param second Second face.
 * @returns Shared endpoints, or null.
 */
function findSharedEdgeOfFaces(
  first: TopologyWorkingFace,
  second: TopologyWorkingFace,
): { vertexA: number; vertexB: number } | null {
  const count = first.vertexIndices.length;
  for (let corner = 0; corner < count; corner++) {
    const vertexA = first.vertexIndices[corner];
    const vertexB = first.vertexIndices[(corner + 1) % count];
    if (vertexA === undefined || vertexB === undefined) {
      continue;
    }
    if (topologyWorkingFaceEdgeCornerIndex(second, vertexA, vertexB) >= 0) {
      return { vertexA, vertexB };
    }
  }
  return null;
}
