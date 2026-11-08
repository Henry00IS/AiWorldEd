import {
  CURVE_POINTS_MAX,
  curveClone,
  curvePointCreate,
  type Curve,
  type CurveSegmentMode,
  type CurveSegmentSection,
} from './curve_model.js';
import { curveMarkersMirror } from './curve_markers.js';
import { curveClamp, curveConstrain, curveConstrainHandles } from './curve_constrain.js';
import { curveBezierParameterAt, curveBezierSplit, curveSegmentControls, curveSegmentIndexAt } from './curve_sample.js';

/**
 * Inserts a point on the curve at x, keeping the shape: a bent segment is split
 * exactly.
 *
 * @param input Curve.
 * @param x Position of the new point.
 * @returns New curve and the new point's index, or -1 when nothing was added.
 */
export function curveInsertPoint(input: Curve, x: number): { curve: Curve; index: number } {
  const curve = curveClone(input);
  const clampedX = curveClamp(x, 0, 1);
  const segment = curveSegmentIndexAt(curve, clampedX);
  const controls = curveSegmentControls(curve, segment);
  const start = curve.points[segment];
  const end = curve.points[segment + 1];
  if (!start || !end || curve.points.length >= CURVE_POINTS_MAX) return { curve, index: -1 };
  if (clampedX <= start.x || clampedX >= end.x) return { curve, index: -1 };
  const { left, right } = curveBezierSplit(controls, curveBezierParameterAt(controls, clampedX));
  const middle = left[left.length - 1] ?? { x: clampedX, y: 0 };
  const point = curvePointCreate(middle.x, middle.y);
  curveInsertApplyHandles(start, point, end, left, right);
  curve.points.splice(segment + 1, 0, point);
  curve.segments.splice(segment + 1, 0, { ...(curve.segments[segment] ?? { mode: 'linear', detail: 8 }) });
  return { curve: curveConstrain(curve), index: segment + 1 };
}

/**
 * Writes the handles of both halves of a split segment.
 *
 * @param start Segment start.
 * @param middle New point.
 * @param end Segment end.
 * @param left Controls of the left half.
 * @param right Controls of the right half.
 */
function curveInsertApplyHandles(
  start: Curve['points'][number],
  middle: Curve['points'][number],
  end: Curve['points'][number],
  left: readonly { x: number; y: number }[],
  right: readonly { x: number; y: number }[],
): void {
  if (left.length < 3) return;
  const offset = (from: { x: number; y: number }, to: { x: number; y: number } | undefined) =>
    to ? { x: to.x - from.x, y: to.y - from.y } : { x: 0, y: 0 };
  start.out = offset(start, left[1]);
  middle.out = offset(middle, right[1]);
  if (left.length === 4) {
    middle.in = offset(middle, left[2]);
    end.in = offset(end, right[2]);
  }
}

/**
 * Deletes a point; the end points cannot be deleted. The joined segment keeps
 * the left segment's mode.
 *
 * @param input Curve.
 * @param index Point index.
 * @returns New curve.
 */
export function curveDeletePoint(input: Curve, index: number): Curve {
  const curve = curveClone(input);
  if (index <= 0 || index >= curve.points.length - 1) return curve;
  curve.points.splice(index, 1);
  curve.segments.splice(index, 1);
  return curveConstrain(curve);
}

/**
 * Sets a segment's bend mode. A segment that becomes bent while its handles are
 * flat gets handles on its chord, so it starts out straight.
 *
 * @param input Curve.
 * @param index Segment index.
 * @param mode New mode.
 * @returns New curve.
 */
export function curveSegmentModeSet(input: Curve, index: number, mode: CurveSegmentMode): Curve {
  const curve = curveClone(input);
  const segment = curve.segments[index];
  const start = curve.points[index];
  const end = curve.points[index + 1];
  if (!segment || !start || !end) return curve;
  segment.mode = mode;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (mode === 'quadratic' && start.out.x === 0 && start.out.y === 0) start.out = { x: dx / 2, y: dy / 2 };
  if (mode === 'bezier' && start.out.x === 0 && start.out.y === 0) start.out = { x: dx / 3, y: dy / 3 };
  if (mode === 'bezier' && end.in.x === 0 && end.in.y === 0) end.in = { x: -dx / 3, y: -dy / 3 };
  return curveConstrain(curve);
}

/**
 * Sets the detail of a segment.
 *
 * @param input Curve.
 * @param index Segment index.
 * @param detail Straight pieces.
 * @returns New curve.
 */
export function curveSegmentDetailSet(input: Curve, index: number, detail: number): Curve {
  const curve = curveClone(input);
  const segment = curve.segments[index];
  if (segment) segment.detail = detail;
  return curveConstrain(curve);
}

/**
 * Makes a segment a straight line and clears its handles.
 *
 * @param input Curve.
 * @param index Segment index.
 * @returns New curve.
 */
export function curveSegmentStraighten(input: Curve, index: number): Curve {
  const curve = curveClone(input);
  const segment = curve.segments[index];
  const start = curve.points[index];
  const end = curve.points[index + 1];
  if (!segment || !start || !end) return curve;
  segment.mode = 'linear';
  start.out = { x: 0, y: 0 };
  end.in = { x: 0, y: 0 };
  return curveConstrain(curve);
}

/**
 * Makes a segment level: both points move to their average height and the
 * segment becomes straight.
 *
 * @param input Curve.
 * @param index Segment index.
 * @returns New curve.
 */
export function curveSegmentFlatten(input: Curve, index: number): Curve {
  const curve = curveSegmentStraighten(input, index);
  const start = curve.points[index];
  const end = curve.points[index + 1];
  if (!start || !end) return curve;
  const level = (start.y + end.y) / 2;
  start.y = level;
  end.y = level;
  curveConstrainHandles(curve, index - 1);
  curveConstrainHandles(curve, index + 2);
  return curveConstrain(curve);
}

/**
 * Mirrors the curve left to right.
 *
 * @param input Curve.
 * @returns New curve.
 */
export function curveMirror(input: Curve): Curve {
  const points = [...input.points].reverse().map((point) => ({
    x: 1 - point.x,
    y: point.y,
    in: { x: -point.out.x, y: point.out.y },
    out: { x: -point.in.x, y: point.in.y },
  }));
  const markers = curveMarkersMirror(input.markers);
  const mirrored = { points, segments: [...input.segments].reverse(), ...(markers ? { markers } : {}) };
  return curveConstrain(curveMirrorQuadratics(mirrored));
}

/**
 * Keeps quadratic segments bent the same way after a mirror: their control
 * moves from the old start to the new start.
 *
 * @param mirrored Mirrored curve whose quadratic controls sit on the wrong end.
 * @returns The same curve with moved quadratic controls.
 */
function curveMirrorQuadratics(mirrored: Curve): Curve {
  mirrored.segments.forEach((segment, index) => {
    const start = mirrored.points[index];
    const end = mirrored.points[index + 1];
    if (segment.mode !== 'quadratic' || !start || !end) return;
    const control = { x: end.x + end.in.x, y: end.y + end.in.y };
    start.out = { x: control.x - start.x, y: control.y - start.y };
    end.in = { x: 0, y: 0 };
  });
  return mirrored;
}

/**
 * Flips the curve upside down.
 *
 * @param input Curve.
 * @returns New curve.
 */
export function curveFlip(input: Curve): Curve {
  const curve = curveClone(input);
  for (const point of curve.points) {
    point.y = 1 - point.y;
    point.in.y = -point.in.y;
    point.out.y = -point.out.y;
  }
  return curveConstrain(curve);
}

/**
 * Sets the cross-section of some segments.
 *
 * @param input Curve.
 * @param indices Segment indices; out-of-range ones are ignored.
 * @param section Cross-section type.
 * @returns New curve.
 */
export function curveSegmentSectionSet(input: Curve, indices: readonly number[], section: CurveSegmentSection): Curve {
  const curve = curveClone(input);
  for (const index of indices) {
    const segment = curve.segments[index];
    if (!segment) continue;
    if (section !== 'round') segment.section = section;
    else delete segment.section;
    if (section === 'rounded_square') segment.cornerRadius ??= 0.25;
    else delete segment.cornerRadius;
  }
  return curve;
}

/**
 * Sets the fillet fraction on selected rounded-square segments.
 *
 * @param input Original curve.
 * @param indices Selected segment indices.
 * @param radius Corner radius relative to half-width.
 * @returns Edited curve.
 */
export function curveSegmentCornerRadiusSet(input: Curve, indices: readonly number[], radius: number): Curve {
  const curve = curveClone(input);
  for (const index of indices) {
    const segment = curve.segments[index];
    if (segment?.section === 'rounded_square') segment.cornerRadius = radius;
  }
  return curveConstrain(curve);
}
