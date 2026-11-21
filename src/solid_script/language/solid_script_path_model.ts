/**
 * How one stretch of a path runs between its two points. Every stretch is
 * straight for now; curved kinds, such as a Bezier, a quadratic or a rounded
 * corner, add their own kind and the control values they need here, and
 * solidScriptPathSample turns them into points.
 */
export interface SolidScriptPathSegment {
  /** How the stretch runs. */
  readonly kind: 'line';
}

/**
 * A path: points joined by segments, one from each point to the next, and from
 * the last back to the first when it is closed. Every reader samples it with
 * solidScriptPathSample and never assumes the segments are straight.
 */
export interface SolidScriptPath<Point> {
  /** Points the segments join, in order. */
  readonly points: readonly Point[];
  /** One per stretch: points less one, or as many as points when closed. */
  readonly segments: readonly SolidScriptPathSegment[];
  /** True when the last point joins back to the first. */
  readonly closed: boolean;
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
 * Samples a path into the points its segments pass through, in order. A
 * straight stretch gives only its start, as its end starts the next one, and a
 * closed path does not repeat its first point at the end.
 *
 * @param path Path.
 * @returns Points.
 */
export function solidScriptPathSample<Point>(path: SolidScriptPath<Point>): Point[] {
  const sampled: Point[] = [];
  path.segments.forEach((segment, index) => {
    const start = path.points[index];
    if (segment.kind === 'line' && start !== undefined) sampled.push(start);
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
export function solidScriptPathWalk<Point>(path: SolidScriptPath<Point>): Point[] {
  const sampled = solidScriptPathSample(path);
  const first = sampled[0];
  return path.closed && first !== undefined && sampled.length > 1 ? [...sampled, first] : sampled;
}

/**
 * Moves every point of a path, keeping its segments.
 *
 * @param path Path.
 * @param move New place of one point.
 * @returns Moved path.
 */
export function solidScriptPathMap<Point, Moved>(
  path: SolidScriptPath<Point>,
  move: (point: Point) => Moved,
): SolidScriptPath<Moved> {
  return { points: path.points.map(move), segments: path.segments, closed: path.closed };
}
