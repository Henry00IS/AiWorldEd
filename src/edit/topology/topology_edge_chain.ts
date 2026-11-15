import type { TopologyEdgeEndpoints } from './topology_edge_subdivide.js';

/** Run of edges joined end to end. */
export interface TopologyEdgeChain {
  /** Vertices in walking order; a closed chain does not repeat its start. */
  vertices: number[];
  /** Whether the last vertex joins back to the first. */
  closed: boolean;
}

/**
 * Joins edges into chains that run end to end.
 *
 * @param edges Undirected edges.
 * @returns Chains, or null when a vertex joins more than two of the edges.
 */
export function collectTopologyEdgeChains(edges: readonly TopologyEdgeEndpoints[]): TopologyEdgeChain[] | null {
  const links = new Map<number, number[]>();
  const link = (from: number, to: number) => links.set(from, [...(links.get(from) ?? []), to]);
  for (const { vertexA, vertexB } of uniqueEdges(edges)) {
    link(vertexA, vertexB);
    link(vertexB, vertexA);
  }
  if ([...links.values()].some((next) => next.length > 2)) return null;
  const visited = new Set<number>();
  const chains: TopologyEdgeChain[] = [];
  const starts = [...links.keys()].sort((a, b) => links.get(a)!.length - links.get(b)!.length || a - b);
  for (const start of starts) {
    if (!visited.has(start)) chains.push(walkChain(links, start, visited));
  }
  return chains;
}

/**
 * Drops repeated and zero-length edges.
 *
 * @param edges Edges.
 * @returns Distinct edges.
 */
function uniqueEdges(edges: readonly TopologyEdgeEndpoints[]): TopologyEdgeEndpoints[] {
  const seen = new Set<string>();
  return edges.filter(({ vertexA, vertexB }) => {
    const key = vertexA < vertexB ? `${vertexA}:${vertexB}` : `${vertexB}:${vertexA}`;
    if (vertexA === vertexB || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Walks one chain from a start vertex.
 *
 * @param links Neighbour lists.
 * @param start Start vertex; an end of the chain when it is open.
 * @param visited Vertices already walked, updated in place.
 * @returns Chain.
 */
function walkChain(links: ReadonlyMap<number, number[]>, start: number, visited: Set<number>): TopologyEdgeChain {
  const vertices = [start];
  visited.add(start);
  let current = start;
  for (;;) {
    const next = (links.get(current) ?? []).find((vertex) => !visited.has(vertex));
    if (next === undefined) break;
    vertices.push(next);
    visited.add(next);
    current = next;
  }
  const closed = vertices.length > 2 && (links.get(current) ?? []).includes(start);
  return { vertices, closed };
}
