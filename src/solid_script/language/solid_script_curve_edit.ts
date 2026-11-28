import { curveConstrain, curveMovePoint } from '@/curve/model/curve_constrain.js';
import {
  CURVE_DETAIL_MAX,
  CURVE_DETAIL_MIN,
  CURVE_POINTS_MAX,
  curvePointCreate,
  type Curve,
  type CurveSegmentMode,
} from '@/curve/model/curve_model.js';
import { curveSegmentInsert, curveSegmentRemove } from '@/curve/model/curve_segments.js';

/** What a Curve block builds a one-segment curve from. */
export interface SolidScriptCurveSpec {
  /** Bend mode of the segment. */
  readonly mode: CurveSegmentMode;
  /** Height at the left end. */
  readonly from: number;
  /** Height at the right end. */
  readonly to: number;
  /** Straight pieces a bent segment is split into. */
  readonly detail: number;
  /**
   * Place the segment leaves its start toward: the control of a quadratic, or
   * the first handle.
   */
  readonly handle?: readonly [number, number];
  /** Place the segment comes into its end from. */
  readonly handleIn?: readonly [number, number];
}

/**
 * Checks a whole number in a range, such as a point number.
 *
 * @param value Number given.
 * @param last Highest number allowed.
 * @param what Name for the message, such as Position.
 * @param detail What the range counts, such as the curve has 3 points.
 */
function solidScriptCurveRange(value: number | undefined, last: number, what: string, detail: string): void {
  if (value === undefined || !Number.isInteger(value) || value < 0 || value > last)
    throw new Error(
      `${what} needs a whole number from 0 to ${last}, because ${detail}, not ${value ?? 'a missing number'}`,
    );
}

/**
 * Builds a curve of one segment from a left end at x 0 to a right end at x 1.
 * Handles stay between the two ends, as the curve editor keeps them.
 *
 * @param spec What to build.
 * @returns Curve.
 */
export function solidScriptCurveSegmentMake(spec: SolidScriptCurveSpec): Curve {
  const [start, end] = [curvePointCreate(0, spec.from), curvePointCreate(1, spec.to)];
  const [out, into] = [spec.handle, spec.handleIn];
  if (out) start.out = { x: out[0] - start.x, y: out[1] - start.y };
  if (into) end.in = { x: into[0] - end.x, y: into[1] - end.y };
  return curveConstrain({ points: [start, end], segments: [{ mode: spec.mode, detail: spec.detail }] });
}

/**
 * Checks the Detail of a built segment.
 *
 * @param detail Number given.
 * @param label Command, for messages.
 * @returns Detail.
 */
export function solidScriptCurveDetail(detail: number | undefined, label: string): number {
  if (detail === undefined || !Number.isInteger(detail) || detail < CURVE_DETAIL_MIN || detail > CURVE_DETAIL_MAX)
    throw new Error(`${label} needs a Detail from ${CURVE_DETAIL_MIN} to ${CURVE_DETAIL_MAX}, such as 8`);
  return detail;
}

/**
 * Puts a point and segment into a curve, see curveSegmentInsert.
 *
 * @param curve Curve.
 * @param at Number the new point gets, from 0 to the point count.
 * @param place Wanted x and height of the new point.
 * @param mode Bend mode of the new segment.
 * @returns New curve.
 */
export function solidScriptCurveInsert(
  curve: Curve,
  at: number | undefined,
  place: readonly [number, number],
  mode: CurveSegmentMode,
): Curve {
  const count = curve.points.length;
  solidScriptCurveRange(at, count, 'Position', `the curve has ${count} points`);
  if (count >= CURVE_POINTS_MAX)
    throw new Error(`Insert Segment needs a curve of fewer than ${CURVE_POINTS_MAX} points, which has ${count}`);
  return curveSegmentInsert(curve, at as number, place[0], place[1], mode);
}

/**
 * Removes a segment from a curve, see curveSegmentRemove.
 *
 * @param curve Curve.
 * @param index Segment number.
 * @returns New curve.
 */
export function solidScriptCurveRemove(curve: Curve, index: number | undefined): Curve {
  const count = curve.segments.length;
  solidScriptCurveRange(index, count - 1, 'Segment', `the curve has ${count} segments`);
  if (curve.points.length < 3) throw new Error('Remove Segment needs a curve of at least 2 segments, which has 1');
  return curveSegmentRemove(curve, index as number);
}

/**
 * Moves a point of a curve: x is kept between the points on either side, the
 * first and last point stay at x 0 and 1, and the height stays from 0 to 1.
 * Left out, x or the height stays as it is.
 *
 * @param curve Curve.
 * @param index Point number.
 * @param x Wanted x, or undefined to keep it.
 * @param y Wanted height, or undefined to keep it.
 * @returns New curve.
 */
export function solidScriptCurveSet(
  curve: Curve,
  index: number | undefined,
  x: number | undefined,
  y: number | undefined,
): Curve {
  const count = curve.points.length;
  solidScriptCurveRange(index, count - 1, 'Point', `the curve has ${count} points`);
  const point = curve.points[index as number];
  return curveMovePoint(curve, index as number, x ?? point?.x ?? 0, y ?? point?.y ?? 0);
}
