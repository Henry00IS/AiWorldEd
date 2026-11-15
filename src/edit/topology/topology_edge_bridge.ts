import { collectTopologyEdgeChains, type TopologyEdgeChain } from './topology_edge_chain.js';
import type { TopologyEdgeEndpoints } from './topology_edge_subdivide.js';
import { addTopologyWorkingFaceLoop } from './topology_face_make.js';
import {
  topologyOperatorApplied,
  topologyOperatorRefused,
  type TopologyOperatorResult,
} from './topology_operator_result.js';
import type { TopologyWorkingGeometry } from './topology_working_geometry.js';

/**
 * Joins two selected edge loops, or two open edge chains, with a strip of
 * quads. The second loop is turned and shifted so each corner meets its closest
 * partner, and every quad is wound against its neighbours.
 *
 * @param geometry Working geometry mutated in place.
 * @param edges Selected edges forming the two loops.
 * @returns Operator result.
 */
export function bridgeTopologyWorkingEdgeLoops(
  geometry: TopologyWorkingGeometry,
  edges: readonly TopologyEdgeEndpoints[],
): TopologyOperatorResult {
  const chains = collectTopologyEdgeChains(edges);
  if (!chains || chains.length !== 2) return topologyOperatorRefused('Bridge Edge Loops needs exactly two edge loops');
  const [first, second] = chains as [TopologyEdgeChain, TopologyEdgeChain];
  if (first.closed !== second.closed || first.vertices.length !== second.vertices.length) {
    return topologyOperatorRefused('Bridge Edge Loops needs two loops with the same number of edges');
  }
  const partner = alignChain(geometry, first, second);
  const spans = first.closed ? first.vertices.length : first.vertices.length - 1;
  for (let index = 0; index < spans; index += 1) {
    const next = (index + 1) % first.vertices.length;
    const quad = [first.vertices[index]!, first.vertices[next]!, partner[next]!, partner[index]!];
    const result = addTopologyWorkingFaceLoop(geometry, quad);
    if (!result.applied) return result;
  }
  return topologyOperatorApplied(`Bridged with ${spans} face(s)`);
}

/**
 * Orders the second chain so each corner faces its closest corner of the first,
 * trying both directions and, for closed loops, every start.
 *
 * @param geometry Working geometry.
 * @param first Reference chain.
 * @param second Chain to align.
 * @returns Second chain's vertices matched index by index to the first.
 */
function alignChain(geometry: TopologyWorkingGeometry, first: TopologyEdgeChain, second: TopologyEdgeChain): number[] {
  const count = second.vertices.length;
  const candidates: number[][] = [];
  for (const direction of [second.vertices, [...second.vertices].reverse()]) {
    const shifts = second.closed ? count : 1;
    for (let shift = 0; shift < shifts; shift += 1) {
      candidates.push(direction.map((_vertex, index) => direction[(index + shift) % count]!));
    }
  }
  const cost = (candidate: number[]) =>
    candidate.reduce(
      (sum, vertex, index) => sum + geometry.positions[vertex]!.distanceTo(geometry.positions[first.vertices[index]!]!),
      0,
    );
  return candidates.reduce((best, candidate) => (cost(candidate) < cost(best) ? candidate : best));
}
