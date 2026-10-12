import type { TopologyWorkingGeometry } from './topology_working_geometry.js';
import { createTopologyWorkingEdge, type TopologyWorkingEdge } from './topology_working_edge_key.js';

/**
 * Collects unique undirected edges from working faces.
 *
 * @param geometry Working geometry.
 * @returns Undirected edges.
 */
export function collectTopologyWorkingEdges(geometry: TopologyWorkingGeometry): TopologyWorkingEdge[] {
  const edges: TopologyWorkingEdge[] = [];
  const seen = new Set<string>();
  for (const face of geometry.faces) {
    appendUniqueFaceEdges(face.vertexIndices, seen, edges);
  }
  return edges;
}

/**
 * Appends unique undirected edges from one face loop.
 *
 * @param vertexIndices Face corner indices.
 * @param seen Already recorded edge keys.
 * @param edges Accumulator.
 */
function appendUniqueFaceEdges(
  vertexIndices: readonly number[],
  seen: Set<string>,
  edges: TopologyWorkingEdge[],
): void {
  const cornerCount = vertexIndices.length;
  for (let corner = 0; corner < cornerCount; corner++) {
    const vertexA = vertexIndices[corner];
    const vertexB = vertexIndices[(corner + 1) % cornerCount];
    if (vertexA === undefined || vertexB === undefined) {
      continue;
    }
    pushUniqueWorkingEdge(vertexA, vertexB, seen, edges);
  }
}

/**
 * Records one undirected edge when it has not been seen.
 *
 * @param vertexA First endpoint.
 * @param vertexB Second endpoint.
 * @param seen Already recorded edge keys.
 * @param edges Accumulator.
 */
function pushUniqueWorkingEdge(
  vertexA: number,
  vertexB: number,
  seen: Set<string>,
  edges: TopologyWorkingEdge[],
): void {
  const edge = createTopologyWorkingEdge(vertexA, vertexB);
  if (seen.has(edge.edgeKey)) {
    return;
  }
  seen.add(edge.edgeKey);
  edges.push(edge);
}
