import { curveHandlePosition, type Curve, type CurveVector } from './curve_model.js';

/**
 * Returns the control polygon of one segment: two points for linear, three for
 * quadratic (the start's outgoing handle is the control), four for bezier.
 *
 * @param curve Curve.
 * @param index Segment index.
 * @returns Control points from start to end.
 */
export function curveSegmentControls(curve: Curve, index: number): CurveVector[] {
  const start = curve.points[index];
  const end = curve.points[index + 1];
  if (!start || !end) return [];
  const mode = curve.segments[index]?.mode ?? 'linear';
  const startPoint = { x: start.x, y: start.y };
  const endPoint = { x: end.x, y: end.y };
  if (mode === 'linear') return [startPoint, endPoint];
  if (mode === 'quadratic') return [startPoint, curveHandlePosition(start, 'out'), endPoint];
  return [startPoint, curveHandlePosition(start, 'out'), curveHandlePosition(end, 'in'), endPoint];
}

/**
 * Evaluates a Bezier of any order with de Casteljau's algorithm.
 *
 * @param controls Control points.
 * @param t Parameter from 0 to 1.
 * @returns Point on the curve.
 */
export function curveBezierAt(controls: readonly CurveVector[], t: number): CurveVector {
  let level = controls.map((point) => ({ ...point }));
  while (level.length > 1) {
    level = level.slice(1).map((point, index) => {
      const previous = level[index] ?? point;
      return { x: previous.x + (point.x - previous.x) * t, y: previous.y + (point.y - previous.y) * t };
    });
  }
  return level[0] ?? { x: 0, y: 0 };
}

/**
 * Splits a Bezier of any order at a parameter.
 *
 * @param controls Control points.
 * @param t Split parameter.
 * @returns Control points of the left and right halves.
 */
export function curveBezierSplit(
  controls: readonly CurveVector[],
  t: number,
): { left: CurveVector[]; right: CurveVector[] } {
  const left: CurveVector[] = [];
  const right: CurveVector[] = [];
  let level = controls.map((point) => ({ ...point }));
  while (level.length > 0) {
    left.push(level[0] ?? { x: 0, y: 0 });
    right.unshift(level[level.length - 1] ?? { x: 0, y: 0 });
    level = level.slice(1).map((point, index) => {
      const previous = level[index] ?? point;
      return { x: previous.x + (point.x - previous.x) * t, y: previous.y + (point.y - previous.y) * t };
    });
  }
  return { left, right };
}

/**
 * Finds the parameter of a segment at an x position. Segments are monotone in
 * x, so bisection converges.
 *
 * @param controls Control points.
 * @param x Wanted x.
 * @returns Parameter from 0 to 1.
 */
export function curveBezierParameterAt(controls: readonly CurveVector[], x: number): number {
  let low = 0;
  let high = 1;
  for (let step = 0; step < 40; step++) {
    const middle = (low + high) / 2;
    if (curveBezierAt(controls, middle).x < x) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

/**
 * Turns one segment into straight pieces: one for linear, detail for bent
 * segments.
 *
 * @param curve Curve.
 * @param index Segment index.
 * @returns Points after the segment start, ending at the segment end.
 */
export function curveSegmentSample(curve: Curve, index: number): CurveVector[] {
  const controls = curveSegmentControls(curve, index);
  const end = controls[controls.length - 1];
  if (!end) return [];
  if (controls.length === 2) return [end];
  const detail = curve.segments[index]?.detail ?? 1;
  return Array.from({ length: detail }, (_, step) =>
    step === detail - 1 ? { ...end } : curveBezierAt(controls, (step + 1) / detail),
  );
}

/**
 * Turns a curve into a polyline from x 0 to x 1, bent segments split by their
 * detail. Equal neighbouring x values are vertical steps.
 *
 * @param curve Curve.
 * @returns Polyline points, left to right.
 */
export function curveSample(curve: Curve): CurveVector[] {
  const first = curve.points[0];
  if (!first) return [];
  const points: CurveVector[] = [{ x: first.x, y: first.y }];
  curve.segments.forEach((_, index) => points.push(...curveSegmentSample(curve, index)));
  return points;
}

/**
 * Evaluates the curve at x. On a vertical step, the value right of the step is
 * returned.
 *
 * @param curve Curve.
 * @param x Position from 0 to 1.
 * @returns Value.
 */
export function curveEvaluate(curve: Curve, x: number): number {
  const index = curveSegmentIndexAt(curve, x);
  const controls = curveSegmentControls(curve, index);
  const start = controls[0];
  const end = controls[controls.length - 1];
  if (!start || !end) return 0;
  if (end.x - start.x < 1e-12) return end.y;
  return curveBezierAt(controls, curveBezierParameterAt(controls, x)).y;
}

/**
 * Returns the segment that covers an x position: the last one whose start is at
 * or left of it.
 *
 * @param curve Curve.
 * @param x Position.
 * @returns Segment index.
 */
export function curveSegmentIndexAt(curve: Curve, x: number): number {
  let found = 0;
  curve.segments.forEach((_, index) => {
    if ((curve.points[index]?.x ?? 0) <= x) found = index;
  });
  return found;
}
