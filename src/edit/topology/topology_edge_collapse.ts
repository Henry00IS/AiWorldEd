import * as THREE from 'three';
import type { TopologyEdgeEndpoints } from './topology_edge_subdivide.js';
import {
  topologyOperatorApplied,
  topologyOperatorRefused,
  type TopologyOperatorResult,
} from './topology_operator_result.js';
import { mergeTopologyWorkingVertices } from './topology_vertex_merge.js';
import type { TopologyWorkingGeometry } from './topology_working_geometry.js';

/**
 * Collapses the given edges: every run of connected edges shrinks into one
 * vertex at the middle of its ends, and faces left with too few corners go
 * away. Vertex indices are compacted afterwards.
 *
 * @param geometry Working geometry mutated in place.
 * @param edges Edges to collapse.
 * @returns Operator result.
 */
export function collapseTopologyWorkingEdges(
  geometry: TopologyWorkingGeometry,
  edges: readonly TopologyEdgeEndpoints[],
): TopologyOperatorResult {
  const groups = groupConnectedVertices(edges.filter(({ vertexA, vertexB }) => vertexA !== vertexB));
  if (groups.length === 0) return topologyOperatorRefused('Collapse Edges needs selected edges');
  for (const group of groups) {
    const centre = new THREE.Vector3();
    for (const vertex of group) centre.add(geometry.positions[vertex]!);
    centre.divideScalar(group.length);
    for (const vertex of group) geometry.positions[vertex]!.copy(centre);
  }
  const merged = mergeTopologyWorkingVertices(geometry, groups.flat(), 'by_distance');
  if (!merged.applied) return merged;
  return topologyOperatorApplied(`Collapsed ${groups.length} edge run(s)`);
}

/**
 * Groups the endpoints of edges that touch each other.
 *
 * @param edges Edges.
 * @returns Vertex groups, one per connected run.
 */
function groupConnectedVertices(edges: readonly TopologyEdgeEndpoints[]): number[][] {
  const parent = new Map<number, number>();
  const find = (vertex: number): number => {
    const up = parent.get(vertex) ?? vertex;
    if (up === vertex) return vertex;
    const root = find(up);
    parent.set(vertex, root);
    return root;
  };
  for (const { vertexA, vertexB } of edges) parent.set(find(vertexA), find(vertexB));
  const groups = new Map<number, number[]>();
  for (const vertex of new Set(edges.flatMap(({ vertexA, vertexB }) => [vertexA, vertexB]))) {
    groups.set(find(vertex), [...(groups.get(find(vertex)) ?? []), vertex]);
  }
  return [...groups.values()];
}
