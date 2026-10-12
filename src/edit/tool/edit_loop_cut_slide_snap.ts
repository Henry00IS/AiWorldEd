import type * as THREE from 'three';
import type { EditorPlaneFrame } from '@/navigation/orientation/editor_orientation_basis.js';
import { TOPOLOGY_EDGE_SPLIT_PARAMETER_EPSILON } from '@/edit/topology/topology_epsilon.js';
import type { LoopCutBeltParameterRange } from '@/edit/topology/topology_loop_cut_belt_range.js';
import { clampLoopCutParameter } from './edit_loop_cut_slide.js';

/** Inclusive parameter window a snapped loop cut must stay inside. */
interface LoopCutSnapWindow {
  /** Clamped query parameter. */
  parameter: number;
  /** Lowest allowed parameter. */
  min: number;
  /** Highest allowed parameter. */
  max: number;
}

/** Best grid-plane hit found while scanning the edge axes. */
interface LoopCutSnapCandidate {
  /** Parameter of the grid-plane crossing. */
  parameter: number;
  /** Absolute distance from the query parameter. */
  distance: number;
}

/**
 * Ignore axis deltas smaller than this when an edge is parallel to a grid
 * plane.
 */
const LOOP_CUT_SNAP_AXIS_EPSILON = 1e-8;

/** Accept a grid value that lands just outside a span because of rounding. */
const LOOP_CUT_SNAP_VALUE_TOLERANCE = 1e-6;

/**
 * Snaps a loop-cut parameter to the nearest grid plane the edge crosses.
 *
 * @param worldA Edge start in world space.
 * @param worldB Edge end in world space.
 * @param parameter Unsnapped parameter.
 * @param snapEnabled True when grid snapping should move the cut.
 * @param snapInterval Grid interval in working-grid units.
 * @param frame Working grid plane. Axes must be unit length.
 * @param range Belt window, or null before a belt exists.
 * @returns Interior parameter. Unchanged when snapping is off or no plane is
 *   crossed.
 */
export function snapLoopCutParameterToGridPlanes(
  worldA: THREE.Vector3,
  worldB: THREE.Vector3,
  parameter: number,
  snapEnabled: boolean,
  snapInterval: number,
  frame: EditorPlaneFrame,
  range: LoopCutBeltParameterRange | null,
): number {
  const parameterWindow = buildLoopCutSnapWindow(parameter, range);
  if (!snapEnabled || snapInterval <= 0) {
    return parameterWindow.parameter;
  }
  const snapped = closestGridPlaneParameter(worldA, worldB, parameterWindow, snapInterval, frame);
  return clampParameterToWindow(snapped, parameterWindow);
}

/**
 * Builds the interior window for one snap query.
 *
 * @param parameter Unsnapped parameter.
 * @param range Belt window, or null.
 * @returns Clamped query and inclusive limits.
 */
function buildLoopCutSnapWindow(parameter: number, range: LoopCutBeltParameterRange | null): LoopCutSnapWindow {
  const min = resolveSnapWindowMin(range);
  const max = resolveSnapWindowMax(range);
  return { parameter: clampParameterBetween(clampLoopCutParameter(parameter), min, max), min, max };
}

/**
 * Returns the low end of the snap window.
 *
 * @param range Belt window, or null.
 * @returns Inclusive minimum parameter.
 */
function resolveSnapWindowMin(range: LoopCutBeltParameterRange | null): number {
  if (!range) {
    return TOPOLOGY_EDGE_SPLIT_PARAMETER_EPSILON;
  }
  return Math.max(range.min, TOPOLOGY_EDGE_SPLIT_PARAMETER_EPSILON);
}

/**
 * Returns the high end of the snap window.
 *
 * @param range Belt window, or null.
 * @returns Inclusive maximum parameter.
 */
function resolveSnapWindowMax(range: LoopCutBeltParameterRange | null): number {
  if (!range) {
    return 1 - TOPOLOGY_EDGE_SPLIT_PARAMETER_EPSILON;
  }
  return Math.min(range.max, 1 - TOPOLOGY_EDGE_SPLIT_PARAMETER_EPSILON);
}

/**
 * Clamps a parameter into an inclusive interval.
 *
 * @param parameter Candidate parameter.
 * @param min Inclusive minimum.
 * @param max Inclusive maximum.
 * @returns Clamped parameter, or the original when the interval is empty.
 */
function clampParameterBetween(parameter: number, min: number, max: number): number {
  if (min > max) {
    return parameter;
  }
  if (parameter < min) {
    return min;
  }
  if (parameter > max) {
    return max;
  }
  return parameter;
}

/**
 * Clamps a snapped parameter into the query window.
 *
 * @param parameter Snapped parameter.
 * @param parameterWindow Snap window.
 * @returns Parameter inside the window.
 */
function clampParameterToWindow(parameter: number, parameterWindow: LoopCutSnapWindow): number {
  return clampParameterBetween(parameter, parameterWindow.min, parameterWindow.max);
}

/**
 * Picks the grid-plane crossing closest to the query parameter.
 *
 * @param worldA Edge start.
 * @param worldB Edge end.
 * @param parameterWindow Snap window.
 * @param snapInterval Grid interval.
 * @param frame Working grid frame.
 * @returns Closest crossing, or the unsnapped query when the edge crosses none.
 */
function closestGridPlaneParameter(
  worldA: THREE.Vector3,
  worldB: THREE.Vector3,
  parameterWindow: LoopCutSnapWindow,
  snapInterval: number,
  frame: EditorPlaneFrame,
): number {
  let best: LoopCutSnapCandidate | null = null;
  best = considerFrameAxis(best, worldA, worldB, parameterWindow, snapInterval, frame.origin, frame.uAxis);
  best = considerFrameAxis(best, worldA, worldB, parameterWindow, snapInterval, frame.origin, frame.normal);
  best = considerFrameAxis(best, worldA, worldB, parameterWindow, snapInterval, frame.origin, frame.vAxis);
  if (!best) {
    return parameterWindow.parameter;
  }
  return best.parameter;
}

/**
 * Considers grid planes perpendicular to one frame axis.
 *
 * @param best Current best candidate, or null.
 * @param worldA Edge start.
 * @param worldB Edge end.
 * @param parameterWindow Snap window.
 * @param snapInterval Grid interval.
 * @param origin Grid origin.
 * @param axis Unit axis.
 * @returns Updated best candidate.
 */
function considerFrameAxis(
  best: LoopCutSnapCandidate | null,
  worldA: THREE.Vector3,
  worldB: THREE.Vector3,
  parameterWindow: LoopCutSnapWindow,
  snapInterval: number,
  origin: THREE.Vector3,
  axis: THREE.Vector3,
): LoopCutSnapCandidate | null {
  const parameter = gridPlaneParameterOnAxis(
    axisCoordinate(worldA, origin, axis),
    axisCoordinate(worldB, origin, axis),
    parameterWindow.parameter,
    parameterWindow.min,
    parameterWindow.max,
    snapInterval,
  );
  if (parameter === null) {
    return best;
  }
  return closerSnapCandidate(best, parameter, parameterWindow.parameter);
}

/**
 * Returns one world point's coordinate along a unit axis.
 *
 * @param point World point.
 * @param origin Grid origin.
 * @param axis Unit axis.
 * @returns Axis coordinate.
 */
function axisCoordinate(point: THREE.Vector3, origin: THREE.Vector3, axis: THREE.Vector3): number {
  return (point.x - origin.x) * axis.x + (point.y - origin.y) * axis.y + (point.z - origin.z) * axis.z;
}

/**
 * Returns the parameter where an edge crosses the nearest in-window grid plane.
 *
 * @param coordA Start coordinate on the axis.
 * @param coordB End coordinate on the axis.
 * @param rawParameter Query parameter.
 * @param minT Lowest allowed parameter.
 * @param maxT Highest allowed parameter.
 * @param interval Grid interval.
 * @returns Parameter, or null when this axis has no in-window plane.
 */
function gridPlaneParameterOnAxis(
  coordA: number,
  coordB: number,
  rawParameter: number,
  minT: number,
  maxT: number,
  interval: number,
): number | null {
  const delta = coordB - coordA;
  if (Math.abs(delta) < LOOP_CUT_SNAP_AXIS_EPSILON || interval <= 0) {
    return null;
  }
  const span = coordinateSpan(coordA, delta, minT, maxT);
  const gridValue = nearestGridValueInSpan(coordA + rawParameter * delta, span.min, span.max, interval);
  if (gridValue === null) {
    return null;
  }
  return (gridValue - coordA) / delta;
}

/**
 * Returns the coordinate interval covered by a parameter window.
 *
 * @param coordA Start coordinate.
 * @param delta End coordinate minus start coordinate.
 * @param minT Lowest parameter.
 * @param maxT Highest parameter.
 * @returns Inclusive coordinate span.
 */
function coordinateSpan(coordA: number, delta: number, minT: number, maxT: number): { min: number; max: number } {
  const start = coordA + minT * delta;
  const end = coordA + maxT * delta;
  if (start <= end) {
    return { min: start, max: end };
  }
  return { min: end, max: start };
}

/**
 * Returns the grid multiple inside a span that is closest to a target.
 *
 * @param target Preferred coordinate.
 * @param minValue Lowest coordinate in the span.
 * @param maxValue Highest coordinate in the span.
 * @param interval Grid interval.
 * @returns Grid value, or null when the span contains none.
 */
function nearestGridValueInSpan(target: number, minValue: number, maxValue: number, interval: number): number | null {
  if (maxValue < minValue || interval <= 0) {
    return null;
  }
  const clampedTarget = Math.min(maxValue, Math.max(minValue, target));
  return nearestMultipleNearTarget(clampedTarget, minValue, maxValue, interval);
}

/**
 * Returns the closest grid multiple to a target that still lies in a span.
 *
 * @param target Coordinate already inside the span.
 * @param minValue Lowest coordinate.
 * @param maxValue Highest coordinate.
 * @param interval Grid interval.
 * @returns Grid value, or null.
 */
function nearestMultipleNearTarget(
  target: number,
  minValue: number,
  maxValue: number,
  interval: number,
): number | null {
  const snapped = Math.round(target / interval) * interval;
  if (isValueInsideSpan(snapped, minValue, maxValue)) {
    return snapped;
  }
  const inward = snapped < minValue ? snapped + interval : snapped - interval;
  if (isValueInsideSpan(inward, minValue, maxValue)) {
    return inward;
  }
  return null;
}

/**
 * Returns whether a value lies in a span, with a small rounding tolerance.
 *
 * @param value Candidate value.
 * @param minValue Lowest coordinate.
 * @param maxValue Highest coordinate.
 * @returns True when the value is inside the padded span.
 */
function isValueInsideSpan(value: number, minValue: number, maxValue: number): boolean {
  return value >= minValue - LOOP_CUT_SNAP_VALUE_TOLERANCE && value <= maxValue + LOOP_CUT_SNAP_VALUE_TOLERANCE;
}

/**
 * Keeps the candidate closest to the query parameter.
 *
 * @param current Current best candidate, or null.
 * @param parameter New candidate parameter.
 * @param rawParameter Query parameter.
 * @returns Closer candidate.
 */
function closerSnapCandidate(
  current: LoopCutSnapCandidate | null,
  parameter: number,
  rawParameter: number,
): LoopCutSnapCandidate {
  const distance = Math.abs(parameter - rawParameter);
  if (!current || distance < current.distance) {
    return { parameter, distance };
  }
  return current;
}
