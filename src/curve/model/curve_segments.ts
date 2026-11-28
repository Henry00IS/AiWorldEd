import { curveClamp, curveConstrain } from './curve_constrain.js';
import { curveSegmentModeSet } from './curve_edit.js';
import {
  CURVE_DETAIL_DEFAULT,
  curveClone,
  curvePointCreate,
  type Curve,
  type CurveSegmentMode,
} from './curve_model.js';

/**
 * Tells which point removing a segment takes away: the point the segment ends
 * at, so the points on either side join up, or for the last segment the point
 * it starts at, so the curve keeps both its ends.
 *
 * @param index Segment number.
 * @param points Points the curve has.
 * @returns Point number.
 */
export function curveSegmentRemovedPoint(index: number, points: number): number {
  return index === points - 2 ? index : index + 1;
}

/**
 * Removes a segment and one of its points, see curveSegmentRemovedPoint. The
 * next segment then runs on from the point before; its own bend mode and
 * handles stay.
 *
 * @param input Curve with at least 3 points.
 * @param index Segment number.
 * @returns New curve.
 */
export function curveSegmentRemove(input: Curve, index: number): Curve {
  const curve = curveClone(input);
  curve.points.splice(curveSegmentRemovedPoint(index, curve.points.length), 1);
  curve.segments.splice(index, 1);
  return curveConstrain(curve);
}

/**
 * Puts a new point and segment into a curve so the point is number At. In the
 * middle the point lies between the two points around it, x kept between them,
 * and splits their segment: the part before keeps its bend mode and the new
 * segment runs from the point to the next one. At 0 the point becomes the
 * first, and at the point count the last, so it sits at x 0 or 1 and the point
 * that was there moves to x; the new segment joins the two. The new segment
 * starts out straight along its chord.
 *
 * @param input Curve with fewer than the most points.
 * @param at Number the new point gets, from 0 to the point count.
 * @param x Wanted x of the new point, or of the old end point at 0 and the end.
 * @param y Height of the new point.
 * @param mode Bend mode of the new segment.
 * @returns New curve.
 */
export function curveSegmentInsert(input: Curve, at: number, x: number, y: number, mode: CurveSegmentMode): Curve {
  const curve = curveClone(input);
  const last = curve.points.length;
  const [before, after] = [curve.points[at - 1], curve.points[at]];
  const point = curvePointCreate(at === 0 ? 0 : at === last ? 1 : curveClamp(x, before?.x ?? 0, after?.x ?? 1), y);
  if (at === 0 && after) after.x = curveClamp(x, 0, curve.points[1]?.x ?? 1);
  if (at === last && before) before.x = curveClamp(x, curve.points[last - 2]?.x ?? 0, 1);
  curve.points.splice(at, 0, point);
  const index = at === last ? at - 1 : at;
  curve.segments.splice(index, 0, { mode, detail: CURVE_DETAIL_DEFAULT });
  return curveSegmentModeSet(curve, index, mode);
}
