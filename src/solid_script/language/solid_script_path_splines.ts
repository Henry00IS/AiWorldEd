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

/** Settings of a NURBS path. */
type SolidScriptPathNurbsSpline = Extract<SolidScriptPathSpline, { kind: 'nurbs' }>;

/**
 * The control points a NURBS path is drawn from, its knots and the part of them
 * it runs over.
 */
interface SolidScriptPathNurbsSetup<Point extends readonly number[]> {
  controls: readonly Point[];
  knots: number[];
  degree: number;
  from: number;
  to: number;
}

/**
 * Builds a knot vector one unit apart: Normal spaces every knot evenly;
 * Endpoint repeats the first and last knot Degree + 1 times so the curve starts
 * and ends on its end points; Bezier repeats every inner knot Degree times so
 * each run of Degree + 1 points is its own Bezier stretch.
 *
 * @param controls Number of control points.
 * @param degree Degree.
 * @param mode Knot mode.
 * @returns Knots, Controls + Degree + 1 of them.
 */
function solidScriptPathKnotVector(controls: number, degree: number, mode: SolidScriptPathKnots): number[] {
  const count = controls + degree + 1;
  if (mode === 'Normal') return Array.from({ length: count }, (_, index) => index);
  if (mode === 'Endpoint')
    return Array.from({ length: count }, (_, index) => Math.min(Math.max(index - degree, 0), controls - degree));
  return Array.from({ length: count }, (_, index) => Math.floor(Math.max(index - 1, 0) / degree));
}

/**
 * Works out what a NURBS path is drawn from. A closed Normal path repeats its
 * first Degree points at the end, the usual periodic curve; Bezier knots skip
 * the outer handles of an open path and run round to the start on a closed one.
 * Paths that cannot be drawn give none.
 *
 * @param points Points.
 * @param closed True when the path loops.
 * @param spline NURBS settings.
 * @returns Setup, or none to keep the points.
 */
function solidScriptPathNurbsSetup<Point extends readonly number[]>(
  points: readonly Point[],
  closed: boolean,
  spline: SolidScriptPathNurbsSpline,
): SolidScriptPathNurbsSetup<Point> | undefined {
  const degree = spline.order - 1;
  if (degree < 1) return undefined;
  const bezier = spline.knots === 'Bezier';
  const controls = bezier
    ? closed
      ? [...points.slice(1), ...points.slice(0, 2)]
      : points.slice(1, -1)
    : closed
      ? [...points, ...points.slice(0, degree)]
      : [...points];
  if (points.length < spline.order || (bezier && (controls.length - 1) % degree !== 0)) return undefined;
  const knots = solidScriptPathKnotVector(controls.length, degree, closed && !bezier ? 'Normal' : spline.knots);
  return { controls, knots, degree, from: knots[degree] ?? 0, to: knots[controls.length] ?? 0 };
}

/**
 * Finds the point of a NURBS path at a parameter with de Boor's algorithm: the
 * Degree + 1 control points of the knot span are blended pairwise, Degree
 * times, into one point.
 *
 * @param setup Path setup.
 * @param t Parameter, from From to To.
 * @returns Point.
 */
function solidScriptPathDeBoor<Point extends readonly number[]>(
  setup: SolidScriptPathNurbsSetup<Point>,
  t: number,
): Point {
  const { controls, knots, degree } = setup;
  let span = degree;
  while (span < controls.length - 1 && (knots[span + 1] ?? 0) <= t) span++;
  const blend: number[][] = Array.from({ length: degree + 1 }, (_, j) => [...(controls[span - degree + j] ?? [])]);
  for (let round = 1; round <= degree; round++) {
    for (let j = degree; j >= round; j--) {
      const low = knots[span - degree + j] ?? 0;
      const high = knots[span + 1 + j - round] ?? 0;
      const share = high === low ? 0 : (t - low) / (high - low);
      blend[j] = (blend[j] ?? []).map((part, axis) => (1 - share) * (blend[j - 1]?.[axis] ?? 0) + share * part);
    }
  }
  return (blend[degree] ?? []) as readonly number[] as Point;
}

/**
 * Samples a NURBS path evenly along its parameter, Resolution steps per unit
 * knot step; an open path also gets its last point, a closed one does not
 * repeat its first.
 *
 * @param points Points.
 * @param closed True when the path loops.
 * @param spline NURBS settings.
 * @returns Points.
 */
function solidScriptPathNurbsSample<Point extends readonly number[]>(
  points: readonly Point[],
  closed: boolean,
  spline: SolidScriptPathNurbsSpline,
): Point[] {
  const setup = solidScriptPathNurbsSetup(points, closed, spline);
  if (!setup) return [...points];
  const steps = Math.max(1, Math.round((setup.to - setup.from) * spline.resolution));
  return Array.from({ length: closed ? steps : steps + 1 }, (_, index) =>
    solidScriptPathDeBoor(setup, setup.from + ((setup.to - setup.from) * index) / steps),
  );
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
