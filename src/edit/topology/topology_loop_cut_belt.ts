import { computeLoopCutBeltParameterRange, type LoopCutBeltParameterRange } from './topology_loop_cut_belt_range.js';
import type { TopologyWorkingGeometry } from './topology_working_geometry.js';
import { createTopologyWorkingEdge, type TopologyWorkingEdge } from './topology_working_edge_key.js';
import type { TopologyLoopCutCrossing } from './topology_loop_cut_plane.js';

/** First-click belt that later slides must keep. */
export interface TopologyLoopCutLockedBelt {
  /** Edges that formed the first valid loop. */
  edges: TopologyWorkingEdge[];
  /** Seed-parameter interval that keeps every locked edge interior. */
  parameterRange: LoopCutBeltParameterRange;
}

/** Seed endpoints that must appear in a valid loop-cut belt. */
export interface LoopCutSeedEdgeRef {
  /** First seed vertex. */
  vertexA: number;
  /** Second seed vertex. */
  vertexB: number;
}

/**
 * Builds a locked belt from first-click crossings.
 *
 * @param crossings First valid loop crossings.
 * @param seedVertexA Seed edge start.
 * @param seedVertexB Seed edge end.
 * @param geometry Working geometry used to compute the slide range.
 * @returns Locked belt, or null when the range cannot be formed.
 */
export function createTopologyLoopCutLockedBelt(
  crossings: readonly TopologyLoopCutCrossing[],
  seedVertexA: number,
  seedVertexB: number,
  geometry: TopologyWorkingGeometry,
): TopologyLoopCutLockedBelt | null {
  const edges = collectLoopCutLockedEdgesFromCrossings(crossings);
  const parameterRange = computeLoopCutBeltParameterRange(geometry, seedVertexA, seedVertexB, edges);
  if (!parameterRange) {
    return null;
  }
  return { edges, parameterRange };
}

/**
 * Collects undirected edges from loop-cut crossings.
 *
 * @param crossings Crossings that become the locked belt.
 * @returns Locked edges.
 */
export function collectLoopCutLockedEdgesFromCrossings(
  crossings: readonly TopologyLoopCutCrossing[],
): TopologyWorkingEdge[] {
  return crossings.map((crossing) => createTopologyWorkingEdge(crossing.vertexA, crossing.vertexB));
}

/**
 * Returns whether a crossing list includes the seed edge.
 *
 * @param crossings Candidate crossings.
 * @param seed Seed edge.
 * @returns True when the seed is one of the crossings.
 */
export function loopCutCrossingsIncludeSeed(
  crossings: readonly TopologyLoopCutCrossing[],
  seed: LoopCutSeedEdgeRef,
): boolean {
  for (const crossing of crossings) {
    if (crossingsShareUndirectedEdge(crossing, seed)) {
      return true;
    }
  }
  return false;
}

/**
 * Returns whether a crossing is the same undirected edge as a seed.
 *
 * @param crossing Crossing.
 * @param seed Seed edge.
 * @returns True when the vertex pairs match.
 */
function crossingsShareUndirectedEdge(crossing: LoopCutSeedEdgeRef, seed: LoopCutSeedEdgeRef): boolean {
  if (crossing.vertexA === seed.vertexA && crossing.vertexB === seed.vertexB) {
    return true;
  }
  return crossing.vertexA === seed.vertexB && crossing.vertexB === seed.vertexA;
}
