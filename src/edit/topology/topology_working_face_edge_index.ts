import { topologyWorkingCornersMatchEdge } from './topology_working_edge_key.js';
import type { TopologyWorkingFace } from './topology_working_face.js';

/**
 * Finds the corner index where a face starts the given undirected edge.
 *
 * @param face Face loop.
 * @param vertexA Edge endpoint A.
 * @param vertexB Edge endpoint B.
 * @returns Corner index of the first endpoint, or -1 when the edge is absent.
 */
export function topologyWorkingFaceEdgeCornerIndex(
  face: TopologyWorkingFace,
  vertexA: number,
  vertexB: number,
): number {
  const cornerCount = face.vertexIndices.length;
  for (let corner = 0; corner < cornerCount; corner++) {
    const current = face.vertexIndices[corner];
    const next = face.vertexIndices[(corner + 1) % cornerCount];
    if (current === undefined || next === undefined) {
      continue;
    }
    if (topologyWorkingCornersMatchEdge(current, next, vertexA, vertexB)) {
      return corner;
    }
  }
  return -1;
}
