import type { TopologyWorkingGeometry } from '@/edit/topology/topology_working_geometry.js';
import { collectTopologyWorkingEdges } from '@/edit/topology/topology_working_edges_collect.js';
import { topologyWorkingVertexRead } from '@/edit/topology/topology_working_vertex_read.js';

/**
 * Finds an undirected edge whose endpoints share X and Z (parallel to Y).
 *
 * @param geometry Working geometry.
 * @returns Endpoints, or null.
 */
export function findWorkingEdgeParallelToY(
  geometry: TopologyWorkingGeometry,
): { vertexA: number; vertexB: number } | null {
  return findWorkingEdgeMatching(geometry, (ax, ay, az, bx, by, bz) => {
    return almostEqual(ax, bx) && almostEqual(az, bz) && !almostEqual(ay, by);
  });
}

/**
 * Finds an undirected edge whose endpoints share Y and Z (parallel to X).
 *
 * @param geometry Working geometry.
 * @returns Endpoints, or null.
 */
export function findWorkingEdgeParallelToX(
  geometry: TopologyWorkingGeometry,
): { vertexA: number; vertexB: number } | null {
  return findWorkingEdgeMatching(geometry, (ax, ay, az, bx, by, bz) => {
    return almostEqual(ay, by) && almostEqual(az, bz) && !almostEqual(ax, bx);
  });
}

/**
 * Finds the vertex whose coordinates maximize x+y+z.
 *
 * @param geometry Working geometry.
 * @returns Vertex index, or -1.
 */
export function findWorkingVertexWithMaxCoordinateSum(geometry: TopologyWorkingGeometry): number {
  let bestIndex = -1;
  let bestSum = -Infinity;
  for (let index = 0; index < geometry.positions.length; index++) {
    const position = topologyWorkingVertexRead(geometry, index);
    if (!position) {
      continue;
    }
    const sum = position.x + position.y + position.z;
    if (sum > bestSum) {
      bestSum = sum;
      bestIndex = index;
    }
  }
  return bestIndex;
}

/**
 * Finds the first edge matching a coordinate predicate.
 *
 * @param geometry Working geometry.
 * @param matches Predicate on endpoint coordinates.
 * @returns Endpoints, or null.
 */
function findWorkingEdgeMatching(
  geometry: TopologyWorkingGeometry,
  matches: (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => boolean,
): { vertexA: number; vertexB: number } | null {
  for (const edge of collectTopologyWorkingEdges(geometry)) {
    const start = topologyWorkingVertexRead(geometry, edge.vertexA);
    const end = topologyWorkingVertexRead(geometry, edge.vertexB);
    if (!start || !end) {
      continue;
    }
    if (matches(start.x, start.y, start.z, end.x, end.y, end.z)) {
      return { vertexA: edge.vertexA, vertexB: edge.vertexB };
    }
  }
  return null;
}

/**
 * Returns whether two numbers are nearly equal.
 *
 * @param left First value.
 * @param right Second value.
 * @returns True when the absolute difference is tiny.
 */
function almostEqual(left: number, right: number): boolean {
  return Math.abs(left - right) < 1e-6;
}
