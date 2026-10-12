import { mapSeedParameterToLockedEdgeParameter } from './topology_loop_cut_belt_range.js';
import { createLoopCutSlicePlane, type TopologyLoopCutCrossing } from './topology_loop_cut_plane.js';
import { orderLoopCutCrossingsAroundPlane } from './topology_loop_cut_order.js';
import type { TopologyWorkingEdge } from './topology_working_edge_key.js';
import type { TopologyWorkingGeometry } from './topology_working_geometry.js';

/** Minimum remapped crossings for a closed belt. */
const LOOP_CUT_REMAP_MIN_CROSSINGS = 3;

/**
 * Slides a locked belt by remapping each locked edge from the seed parameter.
 *
 * @param geometry Working geometry.
 * @param seedVertexA Seed start.
 * @param seedVertexB Seed end.
 * @param seedParameter Seed parameter.
 * @param lockedEdges First-click belt edges.
 * @returns Ordered crossings, or null.
 */
export function remapLoopCutBeltCrossings(
  geometry: TopologyWorkingGeometry,
  seedVertexA: number,
  seedVertexB: number,
  seedParameter: number,
  lockedEdges: readonly TopologyWorkingEdge[],
): TopologyLoopCutCrossing[] | null {
  const crossings = collectRemappedBeltCrossings(geometry, seedVertexA, seedVertexB, seedParameter, lockedEdges);
  if (crossings.length < LOOP_CUT_REMAP_MIN_CROSSINGS) {
    return null;
  }
  return orderRemappedBeltCrossings(geometry, seedVertexA, seedVertexB, seedParameter, crossings);
}

/**
 * Collects remapped crossings for every locked edge.
 *
 * @param geometry Working geometry.
 * @param seedVertexA Seed start.
 * @param seedVertexB Seed end.
 * @param seedParameter Seed parameter.
 * @param lockedEdges Locked edges.
 * @returns Unordered crossings.
 */
function collectRemappedBeltCrossings(
  geometry: TopologyWorkingGeometry,
  seedVertexA: number,
  seedVertexB: number,
  seedParameter: number,
  lockedEdges: readonly TopologyWorkingEdge[],
): TopologyLoopCutCrossing[] {
  const crossings: TopologyLoopCutCrossing[] = [];
  for (const edge of lockedEdges) {
    const crossing = remapOneLockedBeltCrossing(geometry, seedVertexA, seedVertexB, seedParameter, edge);
    if (crossing) {
      crossings.push(crossing);
    }
  }
  return crossings;
}

/**
 * Remaps one locked edge from the seed parameter.
 *
 * @param geometry Working geometry.
 * @param seedVertexA Seed start.
 * @param seedVertexB Seed end.
 * @param seedParameter Seed parameter.
 * @param edge Locked edge.
 * @returns Crossing, or null.
 */
function remapOneLockedBeltCrossing(
  geometry: TopologyWorkingGeometry,
  seedVertexA: number,
  seedVertexB: number,
  seedParameter: number,
  edge: TopologyWorkingEdge,
): TopologyLoopCutCrossing | null {
  const parameter = mapSeedParameterToLockedEdgeParameter(geometry, seedVertexA, seedVertexB, seedParameter, edge);
  if (parameter === null) {
    return null;
  }
  return {
    edgeKey: edge.edgeKey,
    vertexA: edge.vertexA,
    vertexB: edge.vertexB,
    parameter,
  };
}

/**
 * Orders remapped crossings around the slice plane at the seed parameter.
 *
 * @param geometry Working geometry.
 * @param seedVertexA Seed start.
 * @param seedVertexB Seed end.
 * @param seedParameter Seed parameter.
 * @param crossings Unordered remapped crossings.
 * @returns Ordered crossings.
 */
function orderRemappedBeltCrossings(
  geometry: TopologyWorkingGeometry,
  seedVertexA: number,
  seedVertexB: number,
  seedParameter: number,
  crossings: readonly TopologyLoopCutCrossing[],
): TopologyLoopCutCrossing[] {
  const plane = createLoopCutSlicePlane(geometry, seedVertexA, seedVertexB, seedParameter);
  if (!plane) {
    return crossings.slice();
  }
  return orderLoopCutCrossingsAroundPlane(geometry, crossings, plane);
}
