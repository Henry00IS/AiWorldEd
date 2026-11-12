import { curveClamp, curveConstrainHandles } from './curve_constrain.js';
import { curveClone, type Curve, type CurveVector } from './curve_model.js';

/** Allowed range of a group offset or scale factor. */
interface CurveGroupRange {
  /** Lowest value. */
  min: number;
  /** Highest value. */
  max: number;
}

/**
 * Returns whether a point moves horizontally with a group: selected and not an
 * end point, since the ends only move up and down.
 *
 * @param curve Curve.
 * @param selected Selected point indices.
 * @param index Point index.
 * @returns True when the point's x follows the group.
 */
function curveGroupMovesX(curve: Curve, selected: ReadonlySet<number>, index: number): boolean {
  return selected.has(index) && index > 0 && index < curve.points.length - 1;
}

/**
 * Returns the x of the nearest point beside a moving point that stays put
 * horizontally; points never pass it.
 *
 * @param curve Curve.
 * @param selected Selected point indices.
 * @param index Moving point index.
 * @param step -1 for the left neighbour, 1 for the right one.
 * @returns Neighbour x.
 */
function curveGroupFixedNeighbour(curve: Curve, selected: ReadonlySet<number>, index: number, step: number): number {
  let at = index + step;
  while (curveGroupMovesX(curve, selected, at)) at += step;
  return curve.points[at]?.x ?? (step < 0 ? 0 : 1);
}

/**
 * Returns how far a group may move horizontally without a point passing a
 * neighbour that is not part of the group.
 *
 * @param curve Curve.
 * @param selected Selected point indices.
 * @returns Offset range.
 */
function curveGroupRangeX(curve: Curve, selected: ReadonlySet<number>): CurveGroupRange {
  const range = { min: -Infinity, max: Infinity };
  for (const index of selected) {
    const point = curve.points[index];
    if (!point || !curveGroupMovesX(curve, selected, index)) continue;
    range.min = Math.max(range.min, curveGroupFixedNeighbour(curve, selected, index, -1) - point.x);
    range.max = Math.min(range.max, curveGroupFixedNeighbour(curve, selected, index, 1) - point.x);
  }
  return range;
}

/**
 * Returns how far a group may move vertically while every point stays in 0..1.
 *
 * @param curve Curve.
 * @param selected Selected point indices.
 * @returns Offset range.
 */
function curveGroupRangeY(curve: Curve, selected: ReadonlySet<number>): CurveGroupRange {
  const range = { min: -Infinity, max: Infinity };
  for (const index of selected) {
    const point = curve.points[index];
    if (!point) continue;
    range.min = Math.max(range.min, -point.y);
    range.max = Math.min(range.max, 1 - point.y);
  }
  return range;
}

/**
 * Clamps a value into a range, keeping it when the range is unbounded.
 *
 * @param value Wanted value.
 * @param range Range.
 * @param identity Value that changes nothing, used when no value fits.
 * @returns Clamped value.
 */
function curveGroupClamp(value: number, range: CurveGroupRange, identity: number): number {
  if (range.min > range.max) return identity;
  return Math.max(range.min, Math.min(range.max, value));
}

/**
 * Repairs every handle after a group edit.
 *
 * @param curve Curve edited in place.
 * @returns The same curve.
 */
function curveGroupFinish(curve: Curve): Curve {
  curve.points.forEach((_, index) => curveConstrainHandles(curve, index));
  return curve;
}

/**
 * Moves several points together, keeping their shape: the move stops as a whole
 * when one point would pass a neighbour outside the group or leave the unit
 * square; end points move only up and down.
 *
 * @param input Curve.
 * @param indices Selected point indices.
 * @param dx Wanted horizontal offset.
 * @param dy Wanted vertical offset.
 * @returns New curve.
 */
export function curveMovePoints(input: Curve, indices: readonly number[], dx: number, dy: number): Curve {
  const curve = curveClone(input);
  const selected = new Set(indices);
  const x = curveGroupClamp(dx, curveGroupRangeX(curve, selected), 0);
  const y = curveGroupClamp(dy, curveGroupRangeY(curve, selected), 0);
  for (const index of selected) {
    const point = curve.points[index];
    if (!point) continue;
    if (curveGroupMovesX(curve, selected, index)) point.x += x;
    point.y = curveClamp(point.y + y, 0, 1);
  }
  return curveGroupFinish(curve);
}

/**
 * Narrows a scale range so one value stays inside bounds after scaling about an
 * anchor.
 *
 * @param range Range narrowed in place.
 * @param offset Value minus anchor.
 * @param low Lowest allowed value minus anchor.
 * @param high Highest allowed value minus anchor.
 */
function curveGroupScaleLimit(range: CurveGroupRange, offset: number, low: number, high: number): void {
  if (Math.abs(offset) < 1e-12) return;
  const [a, b] = [low / offset, high / offset];
  range.min = Math.max(range.min, Math.min(a, b));
  range.max = Math.min(range.max, Math.max(a, b));
}

/**
 * Returns the horizontal scale factors that keep a group between its fixed
 * neighbours and in order.
 *
 * @param curve Curve.
 * @param selected Selected point indices.
 * @param anchor Anchor x.
 * @returns Factor range.
 */
function curveGroupScaleRangeX(curve: Curve, selected: ReadonlySet<number>, anchor: number): CurveGroupRange {
  const range = { min: 0, max: Infinity };
  for (const index of selected) {
    const point = curve.points[index];
    if (!point || !curveGroupMovesX(curve, selected, index)) continue;
    const low = curveGroupFixedNeighbour(curve, selected, index, -1) - anchor;
    curveGroupScaleLimit(range, point.x - anchor, low, curveGroupFixedNeighbour(curve, selected, index, 1) - anchor);
  }
  return range;
}

/**
 * Returns the vertical scale factors that keep a group inside 0..1.
 *
 * @param curve Curve.
 * @param selected Selected point indices.
 * @param anchor Anchor y.
 * @returns Factor range.
 */
function curveGroupScaleRangeY(curve: Curve, selected: ReadonlySet<number>, anchor: number): CurveGroupRange {
  const range = { min: 0, max: Infinity };
  for (const index of selected) {
    const point = curve.points[index];
    if (point) curveGroupScaleLimit(range, point.y - anchor, -anchor, 1 - anchor);
  }
  return range;
}

/**
 * Scales several points about an anchor; handles scale with them. The factor
 * stops as a whole when a point would pass a neighbour outside the group or
 * leave the unit square, never flips the group, and end points keep their x.
 *
 * @param input Curve.
 * @param indices Selected point indices.
 * @param anchor Fixed point of the scale.
 * @param scale Wanted horizontal and vertical factors.
 * @returns New curve.
 */
export function curveScalePoints(
  input: Curve,
  indices: readonly number[],
  anchor: CurveVector,
  scale: CurveVector,
): Curve {
  const curve = curveClone(input);
  const selected = new Set(indices);
  const sx = curveGroupClamp(scale.x, curveGroupScaleRangeX(curve, selected, anchor.x), 1);
  const sy = curveGroupClamp(scale.y, curveGroupScaleRangeY(curve, selected, anchor.y), 1);
  for (const index of selected) {
    const point = curve.points[index];
    if (!point) continue;
    if (curveGroupMovesX(curve, selected, index)) point.x = anchor.x + (point.x - anchor.x) * sx;
    point.y = curveClamp(anchor.y + (point.y - anchor.y) * sy, 0, 1);
    for (const handle of [point.in, point.out]) {
      handle.x *= sx;
      handle.y *= sy;
    }
  }
  return curveGroupFinish(curve);
}

/**
 * Returns the bounding box of some points.
 *
 * @param curve Curve.
 * @param indices Point indices.
 * @returns Lowest and highest corner, or null without points.
 */
export function curveGroupBounds(
  curve: Curve,
  indices: readonly number[],
): { min: CurveVector; max: CurveVector } | null {
  const points = indices.map((index) => curve.points[index]).filter((point) => point !== undefined);
  if (points.length === 0) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return { min: { x: Math.min(...xs), y: Math.min(...ys) }, max: { x: Math.max(...xs), y: Math.max(...ys) } };
}
