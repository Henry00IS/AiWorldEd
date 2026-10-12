import { TOPOLOGY_EDGE_SPLIT_PARAMETER_EPSILON } from './topology_epsilon.js';
import type { TopologyWorkingEdge } from './topology_working_edge_key.js';
import type { TopologyWorkingGeometry } from './topology_working_geometry.js';
import { topologyWorkingVertexRead } from './topology_working_vertex_read.js';

/** Interior margin so belt cuts stay strictly inside the split-parameter window. */
const LOOP_CUT_BELT_PARAMETER_MARGIN = TOPOLOGY_EDGE_SPLIT_PARAMETER_EPSILON * 2;

/** Inclusive interior parameter range that keeps every locked belt edge cut. */
export interface LoopCutBeltParameterRange {
  /** Lowest seed parameter that still hits every locked edge. */
  min: number;
  /** Highest seed parameter that still hits every locked edge. */
  max: number;
}

/** Seed edge span used to map belt-edge intersections back to seed t. */
interface LoopCutSeedSpan {
  /** Seed start position. */
  start: { x: number; y: number; z: number };
  /** Unit seed direction. */
  directionUnit: { x: number; y: number; z: number };
  /** Seed length. */
  length: number;
}

/**
 * Computes the seed-parameter interval that keeps every locked edge interior.
 *
 * @param geometry Working geometry.
 * @param seedVertexA Seed edge start.
 * @param seedVertexB Seed edge end.
 * @param lockedEdges Edges that formed the first-click belt.
 * @returns Range, or null when no shared interior interval exists.
 */
export function computeLoopCutBeltParameterRange(
  geometry: TopologyWorkingGeometry,
  seedVertexA: number,
  seedVertexB: number,
  lockedEdges: readonly TopologyWorkingEdge[],
): LoopCutBeltParameterRange | null {
  const seed = readLoopCutSeedSpan(geometry, seedVertexA, seedVertexB);
  if (!seed || lockedEdges.length === 0) {
    return null;
  }
  return intersectLockedEdgeParameterIntervals(geometry, seed, lockedEdges);
}

/**
 * Clamps a seed parameter into a belt range.
 *
 * @param parameter Candidate parameter.
 * @param range Valid range.
 * @returns Clamped parameter.
 */
export function clampLoopCutParameterToBelt(parameter: number, range: LoopCutBeltParameterRange): number {
  if (parameter < range.min) {
    return range.min;
  }
  if (parameter > range.max) {
    return range.max;
  }
  return parameter;
}

/**
 * Returns whether a parameter sits inside a belt range.
 *
 * @param parameter Candidate parameter.
 * @param range Valid range.
 * @returns True when the parameter is inclusive-interior.
 */
export function isLoopCutParameterInsideBelt(parameter: number, range: LoopCutBeltParameterRange): boolean {
  return parameter >= range.min && parameter <= range.max;
}

/**
 * Maps a seed-edge parameter onto one locked belt edge.
 *
 * @param geometry Working geometry.
 * @param seedVertexA Seed start.
 * @param seedVertexB Seed end.
 * @param seedParameter Seed parameter.
 * @param edge Locked belt edge.
 * @returns Interior parameter on the locked edge, or null.
 */
export function mapSeedParameterToLockedEdgeParameter(
  geometry: TopologyWorkingGeometry,
  seedVertexA: number,
  seedVertexB: number,
  seedParameter: number,
  edge: TopologyWorkingEdge,
): number | null {
  const seed = readLoopCutSeedSpan(geometry, seedVertexA, seedVertexB);
  const start = topologyWorkingVertexRead(geometry, edge.vertexA);
  const end = topologyWorkingVertexRead(geometry, edge.vertexB);
  if (!seed || !start || !end) {
    return null;
  }
  const denom = dotDirectionDelta(seed.directionUnit, start, end);
  if (Math.abs(denom) < 1e-12) {
    return null;
  }
  const alpha = dotDirectionOffset(seed.directionUnit, seed.start, start);
  return clampLoopCutBeltEdgeParameter((alpha + seedParameter * seed.length) / denom);
}

/**
 * Clamps an edge-split parameter into the belt interior window.
 *
 * @param parameter Raw edge parameter.
 * @returns Interior parameter.
 */
export function clampLoopCutBeltEdgeParameter(parameter: number): number {
  if (parameter < LOOP_CUT_BELT_PARAMETER_MARGIN) {
    return LOOP_CUT_BELT_PARAMETER_MARGIN;
  }
  if (parameter > 1 - LOOP_CUT_BELT_PARAMETER_MARGIN) {
    return 1 - LOOP_CUT_BELT_PARAMETER_MARGIN;
  }
  return parameter;
}

/**
 * Reads the unit span of a seed edge.
 *
 * @param geometry Working geometry.
 * @param seedVertexA Seed start.
 * @param seedVertexB Seed end.
 * @returns Span, or null when the edge is degenerate.
 */
function readLoopCutSeedSpan(
  geometry: TopologyWorkingGeometry,
  seedVertexA: number,
  seedVertexB: number,
): LoopCutSeedSpan | null {
  const start = topologyWorkingVertexRead(geometry, seedVertexA);
  const end = topologyWorkingVertexRead(geometry, seedVertexB);
  if (!start || !end) {
    return null;
  }
  return buildLoopCutSeedSpan(start.x, start.y, start.z, end.x, end.y, end.z);
}

/**
 * Builds a seed span from endpoint coordinates.
 *
 * @param startX Start X.
 * @param startY Start Y.
 * @param startZ Start Z.
 * @param endX End X.
 * @param endY End Y.
 * @param endZ End Z.
 * @returns Span, or null when the edge is degenerate.
 */
function buildLoopCutSeedSpan(
  startX: number,
  startY: number,
  startZ: number,
  endX: number,
  endY: number,
  endZ: number,
): LoopCutSeedSpan | null {
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const deltaZ = endZ - startZ;
  const length = Math.hypot(deltaX, deltaY, deltaZ);
  if (length < 1e-12) {
    return null;
  }
  return {
    start: { x: startX, y: startY, z: startZ },
    directionUnit: { x: deltaX / length, y: deltaY / length, z: deltaZ / length },
    length,
  };
}

/**
 * Intersects every locked-edge valid interval.
 *
 * @param geometry Working geometry.
 * @param seed Seed span.
 * @param lockedEdges Locked belt edges.
 * @returns Intersected range, or null.
 */
function intersectLockedEdgeParameterIntervals(
  geometry: TopologyWorkingGeometry,
  seed: LoopCutSeedSpan,
  lockedEdges: readonly TopologyWorkingEdge[],
): LoopCutBeltParameterRange | null {
  let min = LOOP_CUT_BELT_PARAMETER_MARGIN;
  let max = 1 - LOOP_CUT_BELT_PARAMETER_MARGIN;
  for (const edge of lockedEdges) {
    const interval = computeLockedEdgeSeedParameterInterval(geometry, seed, edge);
    if (!interval) {
      return null;
    }
    min = Math.max(min, interval.min);
    max = Math.min(max, interval.max);
  }
  return min <= max ? { min, max } : null;
}

/**
 * Computes the seed-parameter interval that keeps one locked edge interior.
 *
 * @param geometry Working geometry.
 * @param seed Seed span.
 * @param edge Locked edge.
 * @returns Interval, or null when the edge is parallel to the slice plane.
 */
function computeLockedEdgeSeedParameterInterval(
  geometry: TopologyWorkingGeometry,
  seed: LoopCutSeedSpan,
  edge: TopologyWorkingEdge,
): LoopCutBeltParameterRange | null {
  const start = topologyWorkingVertexRead(geometry, edge.vertexA);
  const end = topologyWorkingVertexRead(geometry, edge.vertexB);
  if (!start || !end) {
    return null;
  }
  const denom = dotDirectionDelta(seed.directionUnit, start, end);
  if (Math.abs(denom) < 1e-12) {
    return null;
  }
  const alpha = dotDirectionOffset(seed.directionUnit, seed.start, start);
  return seedParameterIntervalFromEdgeProjection(alpha, seed.length, denom);
}

/**
 * Converts one locked-edge interior-s constraint into a seed-t interval.
 *
 * @param alpha N·(seedStart − edgeStart).
 * @param seedLength Seed length.
 * @param denom N·(edgeEnd − edgeStart).
 * @returns Interval for seed t.
 */
function seedParameterIntervalFromEdgeProjection(
  alpha: number,
  seedLength: number,
  denom: number,
): LoopCutBeltParameterRange {
  const margin = LOOP_CUT_BELT_PARAMETER_MARGIN;
  const first = (margin * denom - alpha) / seedLength;
  const second = ((1 - margin) * denom - alpha) / seedLength;
  if (first <= second) {
    return { min: first, max: second };
  }
  return { min: second, max: first };
}

/**
 * Dots a unit direction with an edge delta.
 *
 * @param direction Unit direction.
 * @param start Edge start.
 * @param end Edge end.
 * @returns Direction · (end − start).
 */
function dotDirectionDelta(
  direction: { x: number; y: number; z: number },
  start: { x: number; y: number; z: number },
  end: { x: number; y: number; z: number },
): number {
  return direction.x * (end.x - start.x) + direction.y * (end.y - start.y) + direction.z * (end.z - start.z);
}

/**
 * Dots a unit direction with (origin − point).
 *
 * @param direction Unit direction.
 * @param origin Origin.
 * @param point Point.
 * @returns Direction · (origin − point).
 */
function dotDirectionOffset(
  direction: { x: number; y: number; z: number },
  origin: { x: number; y: number; z: number },
  point: { x: number; y: number; z: number },
): number {
  return direction.x * (origin.x - point.x) + direction.y * (origin.y - point.y) + direction.z * (origin.z - point.z);
}
