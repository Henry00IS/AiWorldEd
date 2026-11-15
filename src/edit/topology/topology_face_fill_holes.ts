import { collectTopologyEdgeChains } from './topology_edge_chain.js';
import { collectTopologyBorderEdges } from './topology_edge_extrude.js';
import { addTopologyWorkingFaceLoop } from './topology_face_make.js';
import {
  topologyOperatorApplied,
  topologyOperatorRefused,
  type TopologyOperatorResult,
} from './topology_operator_result.js';
import type { TopologyWorkingGeometry } from './topology_working_geometry.js';

/**
 * Closes every hole whose rim touches one of the given vertices with a single
 * new face, wound to match the faces around it. Nothing is filled when two
 * holes meet at a vertex, since their rims cannot be told apart.
 *
 * @param geometry Working geometry mutated in place.
 * @param vertices Vertices that pick the holes to fill.
 * @returns Operator result.
 */
export function fillTopologyWorkingHoles(
  geometry: TopologyWorkingGeometry,
  vertices: readonly number[],
): TopologyOperatorResult {
  const picked = new Set(vertices);
  const rims = collectTopologyHoleRims(geometry).filter((rim) => rim.some((vertex) => picked.has(vertex)));
  if (rims.length === 0) return topologyOperatorRefused('Fill Holes needs a selection on the rim of a hole');
  const filled = rims.filter((rim) => addTopologyWorkingFaceLoop(geometry, rim).applied).length;
  if (filled === 0) return topologyOperatorRefused('Fill Holes could not close the selected holes');
  return topologyOperatorApplied(`Filled ${filled} hole(s)`);
}

/**
 * Lists the closed rims of open borders, each as vertices in walking order.
 *
 * @param geometry Working geometry.
 * @returns Closed rims with at least three corners, or none when rims meet.
 */
function collectTopologyHoleRims(geometry: TopologyWorkingGeometry): number[][] {
  const edges = geometry.faces.flatMap((face) =>
    face.vertexIndices.map((vertex, corner) => ({
      vertexA: vertex,
      vertexB: face.vertexIndices[(corner + 1) % face.vertexIndices.length]!,
    })),
  );
  const borders = collectTopologyBorderEdges(geometry, edges).map(({ from, to }) => ({ vertexA: from, vertexB: to }));
  const chains = collectTopologyEdgeChains(borders) ?? [];
  return chains.filter((chain) => chain.closed && chain.vertices.length >= 3).map((chain) => chain.vertices);
}
