import { buildComponentEdgeKey } from '@/edit/component/component_selection_entry.js';

/** One undirected edge in working geometry. */
export interface TopologyWorkingEdge {
  /** Canonical undirected key. */
  edgeKey: string;
  /** First endpoint. */
  vertexA: number;
  /** Second endpoint. */
  vertexB: number;
}

/**
 * Builds an undirected working-edge descriptor.
 *
 * @param vertexA First endpoint.
 * @param vertexB Second endpoint.
 * @returns Edge descriptor.
 */
export function createTopologyWorkingEdge(vertexA: number, vertexB: number): TopologyWorkingEdge {
  return {
    edgeKey: buildComponentEdgeKey(vertexA, vertexB),
    vertexA,
    vertexB,
  };
}

/**
 * Returns whether a directed corner pair matches an undirected edge.
 *
 * @param cornerA First corner vertex.
 * @param cornerB Second corner vertex.
 * @param vertexA Edge endpoint A.
 * @param vertexB Edge endpoint B.
 * @returns True when the pair is the same undirected edge.
 */
export function topologyWorkingCornersMatchEdge(
  cornerA: number,
  cornerB: number,
  vertexA: number,
  vertexB: number,
): boolean {
  if (cornerA === vertexA && cornerB === vertexB) {
    return true;
  }
  return cornerA === vertexB && cornerB === vertexA;
}
