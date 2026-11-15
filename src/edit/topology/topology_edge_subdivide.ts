import { splitTopologyWorkingEdge } from './topology_edge_split.js';
import {
  topologyOperatorApplied,
  topologyOperatorRefused,
  type TopologyOperatorResult,
} from './topology_operator_result.js';
import { topologyWorkingFaceEdgeCornerIndex } from './topology_working_face_edge_index.js';
import type { TopologyWorkingGeometry } from './topology_working_geometry.js';

/** Undirected edge given by its two vertex indices. */
export interface TopologyEdgeEndpoints {
  /** First endpoint. */
  vertexA: number;
  /** Second endpoint. */
  vertexB: number;
}

/** Outcome of subdividing edges, with the pieces each edge became. */
export interface TopologyEdgeSubdivideOutcome {
  /** Whether anything changed, and why not. */
  result: TopologyOperatorResult;
  /** Every new edge piece as a vertex pair, in order along each source edge. */
  pieces: Array<[number, number]>;
}

/**
 * Splits each edge into evenly spaced pieces. Every face using an edge gets the
 * new corners, so the surface stays closed.
 *
 * @param geometry Working geometry mutated in place.
 * @param edges Edges to split.
 * @param cuts Number of new vertices per edge.
 * @returns Outcome with the created pieces.
 */
export function subdivideTopologyWorkingEdges(
  geometry: TopologyWorkingGeometry,
  edges: readonly TopologyEdgeEndpoints[],
  cuts: number,
): TopologyEdgeSubdivideOutcome {
  const count = Math.floor(cuts);
  if (!(count >= 1)) return { result: topologyOperatorRefused('Subdivide needs at least one cut'), pieces: [] };
  const pieces: Array<[number, number]> = [];
  for (const edge of uniqueUsedEdges(geometry, edges)) {
    pieces.push(...subdivideOneEdge(geometry, edge, count));
  }
  if (pieces.length === 0) return { result: topologyOperatorRefused('Subdivide needs selected edges'), pieces };
  return { result: topologyOperatorApplied(`Subdivided ${pieces.length / (count + 1)} edge(s)`), pieces };
}

/**
 * Drops repeated edges and edges no face uses.
 *
 * @param geometry Working geometry.
 * @param edges Requested edges.
 * @returns Edges that can be split.
 */
function uniqueUsedEdges(
  geometry: TopologyWorkingGeometry,
  edges: readonly TopologyEdgeEndpoints[],
): TopologyEdgeEndpoints[] {
  const seen = new Set<string>();
  return edges.filter(({ vertexA, vertexB }) => {
    const key = vertexA < vertexB ? `${vertexA}:${vertexB}` : `${vertexB}:${vertexA}`;
    if (vertexA === vertexB || seen.has(key)) return false;
    seen.add(key);
    return geometry.faces.some((face) => topologyWorkingFaceEdgeCornerIndex(face, vertexA, vertexB) >= 0);
  });
}

/**
 * Splits one edge into count + 1 equal pieces, walking from A to B.
 *
 * @param geometry Working geometry.
 * @param edge Edge to split.
 * @param count Number of cuts.
 * @returns Pieces from A to B.
 */
function subdivideOneEdge(
  geometry: TopologyWorkingGeometry,
  edge: TopologyEdgeEndpoints,
  count: number,
): Array<[number, number]> {
  const pieces: Array<[number, number]> = [];
  let current = edge.vertexA;
  for (let remaining = count + 1; remaining > 1; remaining -= 1) {
    const split = splitTopologyWorkingEdge(geometry, current, edge.vertexB, 1 / remaining);
    if (!split) break;
    pieces.push([current, split.newVertexIndex]);
    current = split.newVertexIndex;
  }
  pieces.push([current, edge.vertexB]);
  return pieces;
}
