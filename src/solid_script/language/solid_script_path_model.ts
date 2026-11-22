import {
  solidScriptPathBezierStretch,
  solidScriptPathSplineSample,
  type SolidScriptPathSpline,
} from './solid_script_path_splines.js';

/**
 * How one stretch of a path runs between its two points: straight, or a Bezier
 * curve that leaves its start toward Out and comes into its end from In,
 * sampled in Resolution steps. solidScriptPathSample turns them into points.
 */
export type SolidScriptPathSegment<Point> =
  | { readonly kind: 'line' }
  | { readonly kind: 'bezier'; readonly out: Point; readonly in: Point; readonly resolution: number };

/**
 * A path: points joined by segments, one from each point to the next, and from
 * the last back to the first when it is closed. Every reader samples it with
 * solidScriptPathSample and never assumes the segments are straight.
 */
export interface SolidScriptPath<Point> {
  /** Points the segments join, in order. */
  readonly points: readonly Point[];
  /** One per stretch: points less one, or as many as points when closed. */
  readonly segments: readonly SolidScriptPathSegment<Point>[];
  /** True when the last point joins back to the first. */
  readonly closed: boolean;
  /** Stored drawing steps per stretch, also kept on a straight path. */
  readonly resolution?: number;
  /**
   * Tilt of each point, in degrees about the way the path runs there; none is 0
   * everywhere.
   */
  readonly tilts?: readonly number[];
  /**
   * A curve run through all the points at once; the segments are then straight
   * and unused.
   */
  readonly spline?: SolidScriptPathSpline;
}

/**
 * Creates a path whose every stretch is straight.
 *
 * @param points Points in order.
 * @param closed True when the last point joins back to the first.
 * @returns Path.
 */
export function solidScriptPathStraight<Point>(points: readonly Point[], closed: boolean): SolidScriptPath<Point> {
  const count = closed ? points.length : Math.max(0, points.length - 1);
  return { points: [...points], segments: Array.from({ length: count }, () => ({ kind: 'line' as const })), closed };
}

/**
 * Samples a path into the points its segments pass through, in order. A stretch
 * gives its start and, when curved, the points inside it, as its end starts the
 * next one; a closed path does not repeat its first point at the end.
 *
 * @param path Path.
 * @returns Points.
 */
export function solidScriptPathSample<Point extends readonly number[]>(path: SolidScriptPath<Point>): Point[] {
  if (path.spline) return solidScriptPathSplineSample(path.points, path.closed, path.spline);
  const sampled: Point[] = [];
  path.segments.forEach((segment, index) => {
    const start = path.points[index];
    const end = path.points[(index + 1) % path.points.length];
    if (start === undefined) return;
    if (segment.kind === 'bezier' && end !== undefined)
      sampled.push(...solidScriptPathBezierStretch(start, segment.out, segment.in, end, segment.resolution));
    else sampled.push(start);
  });
  const last = path.points[path.points.length - 1];
  if (!path.closed && last !== undefined) sampled.push(last);
  return sampled;
}

/**
 * Walks a path from its start to its end: the sampled points, and the first
 * again at the end of a closed path, for lengths and places along it.
 *
 * @param path Path.
 * @returns Points.
 */
export function solidScriptPathWalk<Point extends readonly number[]>(path: SolidScriptPath<Point>): Point[] {
  const sampled = solidScriptPathSample(path);
  const first = sampled[0];
  return path.closed && first !== undefined && sampled.length > 1 ? [...sampled, first] : sampled;
}

/**
 * Moves every point and handle of a path, keeping its segments.
 *
 * @param path Path.
 * @param move New place of one point or handle.
 * @returns Moved path.
 */
export function solidScriptPathMap<Point, Moved>(
  path: SolidScriptPath<Point>,
  move: (point: Point) => Moved,
): SolidScriptPath<Moved> {
  const segments = path.segments.map((segment): SolidScriptPathSegment<Moved> =>
    segment.kind === 'line' ? segment : { ...segment, out: move(segment.out), in: move(segment.in) },
  );
  return {
    points: path.points.map(move),
    segments,
    closed: path.closed,
    ...(path.tilts ? { tilts: path.tilts } : {}),
    ...(path.spline ? { spline: path.spline } : {}),
  };
}

/**
 * Gives the tilt at every point solidScriptPathSample gives, in the same order:
 * each point's own, and inside a curved stretch a blend from its start's tilt
 * to its end's; a whole-path curve blends tilts the way it blends points.
 *
 * @param path Path.
 * @returns Tilts in degrees.
 */
export function solidScriptPathSampleTilts<Point>(path: SolidScriptPath<Point>): number[] {
  const count = path.points.length;
  const tilt = (index: number): number => path.tilts?.[index % count] ?? 0;
  if (path.spline)
    return solidScriptPathSplineSample(
      path.points.map((_, index) => [tilt(index)]),
      path.closed,
      path.spline,
    ).map((value) => value[0] ?? 0);
  const sampled: number[] = [];
  path.segments.forEach((segment, index) => {
    if (index >= count) return;
    sampled.push(tilt(index));
    if (segment.kind === 'bezier')
      for (let step = 1; step < segment.resolution; step++)
        sampled.push(tilt(index) + ((tilt(index + 1) - tilt(index)) * step) / segment.resolution);
  });
  if (!path.closed && count > 0) sampled.push(tilt(count - 1));
  return sampled;
}
