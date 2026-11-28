import { curveSegmentRemovedPoint } from '@/curve/model/curve_segments.js';
import { solidScriptPathPicked, solidScriptPathWithoutSpline } from './solid_script_path_pick.js';
import type { SolidScriptPath } from './solid_script_path_model.js';

/**
 * Lists the numbers 0 up to a count.
 *
 * @param count How many.
 * @returns Numbers.
 */
function solidScriptPathSegmentRange(count: number): number[] {
  return Array.from({ length: count }, (_, number) => number);
}

/**
 * Opens a closed path at a segment: every point stays, and the path starts at
 * the point the segment ended at and runs round to the point it started at.
 *
 * @param path Closed path with no whole-path curve.
 * @param index Segment number.
 * @returns Open path.
 */
function solidScriptPathSegmentOpen(path: SolidScriptPath<number[]>, index: number): SolidScriptPath<number[]> {
  const count = path.points.length;
  const order = solidScriptPathSegmentRange(count).map((step) => (index + 1 + step) % count);
  const segments = order.slice(0, -1).map((start) => path.segments[start]!);
  return solidScriptPathPicked(path, order, segments);
}

/**
 * Takes a segment out of an open path with the point it ends at, so the points
 * on either side join up; the last segment takes the point it starts at, so the
 * path keeps both its ends. The next stretch runs on from the point before, and
 * keeps its own curve.
 *
 * @param path Open path with at least 3 points and no whole-path curve.
 * @param index Segment number.
 * @returns Open path.
 */
function solidScriptPathSegmentJoin(path: SolidScriptPath<number[]>, index: number): SolidScriptPath<number[]> {
  const dropped = curveSegmentRemovedPoint(index, path.points.length);
  const kept = solidScriptPathSegmentRange(path.points.length).filter((point) => point !== dropped);
  return solidScriptPathPicked(
    path,
    kept,
    path.segments.filter((_, segment) => segment !== index),
  );
}

/**
 * Removes a segment of a path by its number. An open path loses the segment and
 * one of its points, see solidScriptPathSegmentJoin; a closed path is opened at
 * the segment and keeps every point. A Catmull Rom or NURBS path first becomes
 * Bezier as Set Path Type makes it. Tilts, handle types, handles and the normal
 * stay with their points.
 *
 * @param path Path.
 * @param index Segment number, from 0.
 * @param label Command, for messages.
 * @returns Path.
 */
export function solidScriptPathSegmentRemove(
  path: SolidScriptPath<number[]>,
  index: number | undefined,
  label: string,
): SolidScriptPath<number[]> {
  const plain = solidScriptPathWithoutSpline(path);
  const count = plain.segments.length;
  if (index === undefined || !Number.isInteger(index) || index < 0 || index >= count)
    throw new Error(
      `Segment needs a whole number from 0 to ${count - 1}, because the path has ${count} segments, not ${index ?? 'a missing number'}`,
    );
  if (plain.closed) return solidScriptPathSegmentOpen(plain, index);
  if (plain.points.length < 3)
    throw new Error(`${label} needs a path of at least 3 points, which has ${plain.points.length}`);
  return solidScriptPathSegmentJoin(plain, index);
}
