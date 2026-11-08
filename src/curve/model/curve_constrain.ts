import { curveSectionConstrain } from './curve_section.js';
import {
  CURVE_DETAIL_DEFAULT,
  CURVE_DETAIL_MAX,
  CURVE_DETAIL_MIN,
  CURVE_POINTS_MAX,
  CURVE_SEGMENT_MODES,
  curveClone,
  curvePointCreate,
  type Curve,
  type CurvePoint,
  type CurveSegment,
} from './curve_model.js';
import { curveMarkersConstrain } from './curve_markers.js';

/**
 * Clamps a number into a range; non-finite numbers become the minimum.
 *
 * @param value Candidate.
 * @param min Inclusive minimum.
 * @param max Inclusive maximum.
 * @returns Clamped value.
 */
export function curveClamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

/**
 * Returns a valid copy of a curve: at least two points, ends at x 0 and 1,
 * points in order and inside the unit square, one valid segment per gap, and
 * handles that keep each segment a function of x.
 *
 * @param input Curve to repair.
 * @returns Valid curve.
 */
export function curveConstrain(input: Curve): Curve {
  const curve = curveClone(input);
  if (curve.points.length > CURVE_POINTS_MAX) curve.points.length = CURVE_POINTS_MAX;
  while (curve.points.length < 2) curve.points.push(curvePointCreate(curve.points.length, 0));
  curveConstrainPoints(curve.points);
  curve.segments = curve.points.slice(1).map((_, index) => curveConstrainSegment(curve.segments[index]));
  curve.points.forEach((_, index) => curveConstrainHandles(curve, index));
  const markers = curveMarkersConstrain(curve.markers);
  if (markers) curve.markers = markers;
  else delete curve.markers;
  return curve;
}

/**
 * Orders and clamps points in place; the ends sit at x 0 and x 1.
 *
 * @param points Points.
 */
function curveConstrainPoints(points: CurvePoint[]): void {
  let previous = 0;
  points.forEach((point, index) => {
    point.y = curveClamp(point.y, 0, 1);
    point.x = index === 0 ? 0 : index === points.length - 1 ? 1 : curveClamp(point.x, previous, 1);
    previous = point.x;
  });
}

/**
 * Returns a valid segment.
 *
 * @param segment Stored segment, or undefined.
 * @returns Segment.
 */
function curveConstrainSegment(segment: CurveSegment | undefined): CurveSegment {
  const mode = CURVE_SEGMENT_MODES.includes(segment?.mode as CurveSegment['mode']) ? segment?.mode : 'linear';
  const detail = Math.round(curveClamp(segment?.detail ?? CURVE_DETAIL_DEFAULT, CURVE_DETAIL_MIN, CURVE_DETAIL_MAX));
  return { mode: mode ?? 'linear', detail, ...curveSectionConstrain(segment) };
}

/**
 * Keeps one point's handles inside its segments: an outgoing handle between the
 * point and the next point, an incoming one between the previous point and the
 * point, inside 0..1 vertically, and, for a bezier, never past the other handle
 * of the same segment, so the segment stays a function of x.
 *
 * @param curve Curve being repaired.
 * @param index Point index.
 */
export function curveConstrainHandles(curve: Curve, index: number): void {
  const point = curve.points[index];
  if (!point) return;
  const previous = curve.points[index - 1];
  const next = curve.points[index + 1];
  point.in = previous ? curveHandleClamp(point, point.in, previous.x, point.x) : { x: 0, y: 0 };
  point.out = next ? curveHandleClamp(point, point.out, point.x, next.x) : { x: 0, y: 0 };
  if (next && curve.segments[index]?.mode === 'bezier') curveHandlesUncross(point, next);
  if (previous && curve.segments[index - 1]?.mode === 'bezier') curveHandlesUncross(previous, point);
}

/**
 * Clamps one handle offset to a horizontal band and the unit square.
 *
 * @param point Owning point.
 * @param handle Handle offset.
 * @param minX Leftmost absolute x.
 * @param maxX Rightmost absolute x.
 * @returns Clamped offset.
 */
function curveHandleClamp(point: CurvePoint, handle: CurvePoint['in'], minX: number, maxX: number): CurvePoint['in'] {
  const x = curveClamp(point.x + handle.x, minX, maxX);
  const y = curveClamp(point.y + handle.y, 0, 1);
  return { x: x - point.x, y: y - point.y };
}

/**
 * Meets the two handles of a bezier segment halfway when the outgoing one would
 * pass the incoming one.
 *
 * @param start Segment start point.
 * @param end Segment end point.
 */
function curveHandlesUncross(start: CurvePoint, end: CurvePoint): void {
  const outX = start.x + start.out.x;
  const inX = end.x + end.in.x;
  if (outX <= inX) return;
  const middle = (outX + inX) / 2;
  start.out.x = middle - start.x;
  end.in.x = middle - end.x;
}

/**
 * Moves a point, keeping it between its neighbours; the end points move only up
 * and down. Its handles move with it and are clamped again.
 *
 * @param input Curve.
 * @param index Point index.
 * @param x Wanted x.
 * @param y Wanted y.
 * @returns New curve.
 */
export function curveMovePoint(input: Curve, index: number, x: number, y: number): Curve {
  const curve = curveClone(input);
  const point = curve.points[index];
  if (!point) return curve;
  const last = curve.points.length - 1;
  const minX = curve.points[index - 1]?.x ?? 0;
  const maxX = curve.points[index + 1]?.x ?? 1;
  point.x = index === 0 ? 0 : index === last ? 1 : curveClamp(x, minX, maxX);
  point.y = curveClamp(y, 0, 1);
  for (const neighbour of [index - 1, index, index + 1]) curveConstrainHandles(curve, neighbour);
  return curve;
}

/**
 * Moves one handle to an absolute position, clamped to its segment.
 *
 * @param input Curve.
 * @param index Point index.
 * @param side 'in' or 'out'.
 * @param x Wanted absolute x.
 * @param y Wanted absolute y.
 * @returns New curve.
 */
export function curveMoveHandle(input: Curve, index: number, side: 'in' | 'out', x: number, y: number): Curve {
  const curve = curveClone(input);
  const point = curve.points[index];
  if (!point) return curve;
  const segment = side === 'out' ? index : index - 1;
  const partner = side === 'out' ? curve.points[index + 1] : curve.points[index - 1];
  let wantedX = x;
  if (partner && curve.segments[segment]?.mode === 'bezier') {
    const other = side === 'out' ? partner.x + partner.in.x : partner.x + partner.out.x;
    wantedX = side === 'out' ? Math.min(x, other) : Math.max(x, other);
  }
  point[side] = { x: wantedX - point.x, y: y - point.y };
  curveConstrainHandles(curve, index);
  return curve;
}
