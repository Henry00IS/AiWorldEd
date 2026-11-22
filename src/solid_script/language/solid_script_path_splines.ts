/**
 * Paths that run through all their points at once rather than stretch by
 * stretch: Catmull Rom curves through every point, and NURBS curves pulled
 * toward their points.
 */

/**
 * How a NURBS path spaces its knots: evenly, pinned to its ends, or in Bezier
 * stretches of three points.
 */
export type SolidScriptPathKnots = 'Normal' | 'Endpoint' | 'Bezier';

/** A whole-path curve and the steps each stretch of it is sampled in. */
export type SolidScriptPathSpline =
  | { readonly kind: 'catmull'; readonly resolution: number }
  | {
      readonly kind: 'nurbs';
      readonly resolution: number;
      readonly order: number;
      readonly knots: SolidScriptPathKnots;
    };

/** Order a path made NURBS gets: cubic. */
export const SOLID_SCRIPT_PATH_NURBS_ORDER = 4;

/**
 * Finds the point a Bezier stretch passes at T, from 0 at its start to 1 at its
 * end.
 *
 * @param start Start point.
 * @param out Handle it leaves toward.
 * @param into Handle the end is reached from.
 * @param end End point.
 * @param t Place along it.
 * @returns Point, with as many numbers as Start.
 */
function solidScriptPathBezierAt<Point extends readonly number[]>(
  start: Point,
  out: readonly number[],
  into: readonly number[],
  end: readonly number[],
  t: number,
): Point {
  const u = 1 - t;
  const mixed = start.map(
    (value, axis) =>
      u * u * u * value +
      3 * u * u * t * (out[axis] ?? 0) +
      3 * u * t * t * (into[axis] ?? 0) +
      t * t * t * (end[axis] ?? 0),
  );
  return mixed as readonly number[] as Point;
}

/**
 * Samples one Bezier stretch in Resolution steps: its start and the points
 * inside it, as its end starts the next stretch.
 *
 * @param start Start point.
 * @param out Handle it leaves toward.
 * @param into Handle the end is reached from.
 * @param end End point.
 * @param resolution Steps.
 * @returns Points.
 */
export function solidScriptPathBezierStretch<Point extends readonly number[]>(
  start: Point,
  out: readonly number[],
  into: readonly number[],
  end: readonly number[],
  resolution: number,
): Point[] {
  return Array.from({ length: Math.max(1, resolution) }, (_, step) =>
    solidScriptPathBezierAt(start, out, into, end, step / resolution),
  );
}

/**
 * Gives the Bezier handles a Catmull Rom curve has at each point: a sixth of
 * the way from one neighbour to the other, an open end standing in for its
 * missing neighbour.
 *
 * @param points Points.
 * @param closed True when the last point joins back to the first.
 * @returns Handle each point is reached from and handle it leaves toward.
 */
export function solidScriptPathCatmullHandles(
  points: readonly (readonly number[])[],
  closed: boolean,
): { left: number[][]; right: number[][] } {
  const count = points.length;
  const at = (index: number): readonly number[] =>
    points[closed ? (index + count) % count : Math.min(count - 1, Math.max(0, index))] ?? [];
  const offsets = points.map((_, index) =>
    at(index + 1).map((value, axis) => (value - (at(index - 1)[axis] ?? 0)) / 6),
  );
  return {
    left: points.map((point, index) => point.map((value, axis) => value - (offsets[index]?.[axis] ?? 0))),
    right: points.map((point, index) => point.map((value, axis) => value + (offsets[index]?.[axis] ?? 0))),
  };
}

/**
 * Samples a Catmull Rom curve: each point, then Resolution less one points
 * inside each stretch, and the last point of an open one.
 *
 * @param points Points.
 * @param closed True when the last point joins back to the first.
 * @param resolution Steps per stretch.
 * @returns Points.
 */
function solidScriptPathCatmullSample<Point extends readonly number[]>(
  points: readonly Point[],
  closed: boolean,
  resolution: number,
): Point[] {
  const handles = solidScriptPathCatmullHandles(points, closed);
  const stretches = points.length < 2 ? 0 : closed ? points.length : points.length - 1;
  const sampled = Array.from({ length: stretches }, (_, index) => {
    const next = (index + 1) % points.length;
    const start = points[index] as Point;
    const end = points[next] ?? start;
    return solidScriptPathBezierStretch(start, handles.right[index] ?? [], handles.left[next] ?? [], end, resolution);
  }).flat();
  const last = points[points.length - 1];
  if ((!closed || stretches === 0) && last !== undefined) sampled.push(last);
  return sampled;
}

/**
 * Tells how a NURBS path's knots repeat: how often each inner value, how often
 * the first, and how many at the end carry on from the start.
 *
 * @param order Order.
 * @param closed True when the path loops.
 * @param mode How the knots are spaced.
 * @returns Repeats of inner values, of the first value, and knots at the end.
 */
function solidScriptPathKnotRuns(
  order: number,
  closed: boolean,
  mode: SolidScriptPathKnots,
): { repeat: number; head: number; tail: number } {
  const repeat = mode === 'Bezier' ? order - 1 : 1;
  const head = mode === 'Endpoint' ? order - (closed ? 1 : 0) : mode === 'Bezier' ? Math.min(2, repeat) : 1;
  return { repeat, head, tail: closed ? 2 * order - 1 : mode === 'Endpoint' ? order : 0 };
}

/**
 * Lays out the knots of a NURBS path: each Bezier stretch shares one knot
 * value, Endpoint repeats the first and last so the path reaches its ends, and
 * a closed path carries on past its end to wrap round.
 *
 * @param count Points.
 * @param order Order.
 * @param closed True when the path loops.
 * @param mode How the knots are spaced.
 * @returns Knots.
 */
function solidScriptPathKnotValues(
  count: number,
  order: number,
  closed: boolean,
  mode: SolidScriptPathKnots,
): number[] {
  const { repeat, head, tail } = solidScriptPathKnotRuns(order, closed, mode);
  const knots = new Array<number>(count + order + (closed ? order - 1 : 0)).fill(0);
  const offset = mode === 'Endpoint' && closed ? 1 : 0;
  let left = head;
  let current = offset;
  for (let index = offset; index < knots.length - tail; index++) {
    knots[index] = current;
    left--;
    if (left === 0) {
      current++;
      left = repeat;
    }
  }
  for (let index = 0; index < tail; index++)
    knots[knots.length - tail + index] = current + (knots[index] ?? 0) - (knots[0] ?? 0);
  return knots;
}

/**
 * Weighs the points that shape a NURBS path at one place along it, the way the
 * standard recurrence does, starting from the point Span less Degree.
 *
 * @param knots Knots.
 * @param degree Order less one.
 * @param t Place along the path, in knot values.
 * @param span Knot the place lies after.
 * @returns Weight of each of Degree plus one points.
 */
function solidScriptPathNurbsBasis(knots: readonly number[], degree: number, t: number, span: number): number[] {
  const weights = [1];
  const left = [0];
  const right = [0];
  for (let j = 1; j <= degree; j++) {
    left[j] = t - (knots[span + 1 - j] ?? 0);
    right[j] = (knots[span + j] ?? 0) - t;
    let saved = 0;
    for (let r = 0; r < j; r++) {
      const share = (weights[r] ?? 0) / ((right[r + 1] ?? 0) + (left[j - r] ?? 0));
      weights[r] = saved + (right[r + 1] ?? 0) * share;
      saved = (left[j - r] ?? 0) * share;
    }
    weights[j] = saved;
  }
  return weights;
}

/**
 * Mixes points by weight, the first weight going to the point at Start and
 * wrapping round past the last.
 *
 * @param points Points.
 * @param weights Weights.
 * @param start Point the first weight goes to.
 * @returns Mixed point.
 */
function solidScriptPathMix<Point extends readonly number[]>(
  points: readonly Point[],
  weights: readonly number[],
  start: number,
): Point {
  const mixed = (points[0] ?? []).map((_, axis) =>
    weights.reduce((sum, weight, j) => sum + weight * (points[(start + j) % points.length]?.[axis] ?? 0), 0),
  );
  return mixed as readonly number[] as Point;
}

/**
 * Tells whether a NURBS path can be drawn: enough points for its order, and
 * Bezier knots that fall in whole stretches.
 *
 * @param count Points.
 * @param spline NURBS settings.
 * @param closed True when the path loops.
 * @returns True when it can.
 */
function solidScriptPathNurbsDrawable(
  count: number,
  spline: SolidScriptPathSpline & { kind: 'nurbs' },
  closed: boolean,
): boolean {
  if (count < spline.order || spline.order < 2 || spline.resolution < 1) return false;
  if (spline.knots !== 'Bezier') return true;
  return count > spline.order && (!closed || count % (spline.order - 1) === 0);
}

/**
 * Samples a NURBS path: Resolution points along each stretch between distinct
 * knots, and the end of an open one. One that cannot be drawn runs straight
 * through its points.
 *
 * @param points Points.
 * @param closed True when the path loops.
 * @param spline NURBS settings.
 * @returns Points.
 */
function solidScriptPathNurbsSample<Point extends readonly number[]>(
  points: readonly Point[],
  closed: boolean,
  spline: SolidScriptPathSpline & { kind: 'nurbs' },
): Point[] {
  if (!solidScriptPathNurbsDrawable(points.length, spline, closed)) return [...points];
  const degree = spline.order - 1;
  const knots = solidScriptPathKnotValues(points.length, spline.order, closed, spline.knots);
  const wrapped = points.length + (closed ? degree : 0);
  const at = (t: number, span: number): Point =>
    solidScriptPathMix(points, solidScriptPathNurbsBasis(knots, degree, t, span), span - degree);
  const sampled: Point[] = [];
  let lastSpan = degree;
  for (let span = degree; span < wrapped; span++) {
    const from = knots[span] ?? 0;
    const width = (knots[span + 1] ?? 0) - from;
    if (width <= 0) continue;
    lastSpan = span;
    for (let step = 0; step < spline.resolution; step++)
      sampled.push(at(from + (width * step) / spline.resolution, span));
  }
  if (!closed) sampled.push(at(knots[wrapped] ?? 0, lastSpan));
  return sampled;
}

/**
 * Samples a whole-path curve into the points it passes through, in order; a
 * closed one does not repeat its first point at the end.
 *
 * @param points Points.
 * @param closed True when the path loops.
 * @param spline Curve settings.
 * @returns Points.
 */
export function solidScriptPathSplineSample<Point extends readonly number[]>(
  points: readonly Point[],
  closed: boolean,
  spline: SolidScriptPathSpline,
): Point[] {
  if (spline.kind === 'catmull') return solidScriptPathCatmullSample(points, closed, spline.resolution);
  return solidScriptPathNurbsSample(points, closed, spline);
}
