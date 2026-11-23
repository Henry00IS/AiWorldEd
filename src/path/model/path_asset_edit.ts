import {
  PATH_ASSET_ARC_AXIS,
  PATH_ASSET_ARC_DEGREES,
  pathAssetFromData,
  type PathAsset,
  type PathAssetPoint,
  type PathAssetSegment,
  type PathAssetSegmentKind,
} from './path_asset.js';

/** A handle of a curved stretch that drags as a point. */
export type PathAssetHandle = 'control' | 'out' | 'in';

/** Where a handle of a stretch is. */
export interface PathAssetHandlePlace {
  /** Which handle. */
  handle: PathAssetHandle;
  /** Point the handle is at. */
  point: PathAssetPoint;
}

/**
 * Moves one point of a path.
 *
 * @param path Path.
 * @param index Point index.
 * @param point New point.
 * @returns Changed path.
 */
export function pathAssetPointMove(path: PathAsset, index: number, point: PathAssetPoint): PathAsset {
  return { ...path, points: path.points.map((each, at) => (at === index ? point : each)) };
}

/**
 * Adds a point after another. A point added after the end of an open path gets
 * a straight stretch; one added inside a stretch splits it into two of its
 * kind.
 *
 * @param path Path.
 * @param after Index of the point the new one follows.
 * @param point New point.
 * @returns Changed path.
 */
export function pathAssetPointInsert(path: PathAsset, after: number, point: PathAssetPoint): PathAsset {
  const points = [...path.points];
  points.splice(after + 1, 0, point);
  const segments = [...path.segments];
  const split = path.segments[after];
  segments.splice(split ? after + 1 : after, 0, split ?? { kind: 'Straight' });
  return pathAssetFromData({ points, segments, closed: path.closed }) ?? path;
}

/**
 * Removes a point, joining the stretches on either side into the one that came
 * into it; a closed path left with two points opens.
 *
 * @param path Path.
 * @param index Point index.
 * @returns Changed path, or null when the path has only two points.
 */
export function pathAssetPointRemove(path: PathAsset, index: number): PathAsset | null {
  if (path.points.length <= 2) return null;
  const leaving = !path.closed && index === path.points.length - 1 ? index - 1 : index;
  return pathAssetFromData({
    points: path.points.filter((_, at) => at !== index),
    segments: path.segments.filter((_, at) => at !== leaving),
    closed: path.closed,
  });
}

/**
 * Removes several points, as Remove does one at a time from the last.
 *
 * @param path Path.
 * @param indices Point indices.
 * @returns Changed path, or null when fewer than two points would be left.
 */
export function pathAssetPointsRemove(path: PathAsset, indices: readonly number[]): PathAsset | null {
  return [...indices]
    .sort((a, b) => b - a)
    .reduce<PathAsset | null>((left, index) => left && pathAssetPointRemove(left, index), path);
}

/**
 * Closes or opens a path; a closed path gets a straight stretch back to its
 * first point.
 *
 * @param path Path.
 * @param closed True to close.
 * @returns Changed path.
 */
export function pathAssetClosedSet(path: PathAsset, closed: boolean): PathAsset {
  return pathAssetFromData({ ...path, closed }) ?? path;
}

/**
 * Sets one stretch, keeping only the settings of its kind.
 *
 * @param path Path.
 * @param index Stretch index.
 * @param segment New stretch.
 * @returns Changed path.
 */
export function pathAssetSegmentSet(path: PathAsset, index: number, segment: PathAssetSegment): PathAsset {
  const segments = path.segments.map((each, at) => (at === index ? segment : each));
  return pathAssetFromData({ ...path, segments }) ?? path;
}

/**
 * Turns a stretch into another kind with settings that start out gentle: Bezier
 * handles a third of the way along, a Quadratic control in the middle, and a
 * quarter turn Arc lying flat.
 *
 * @param path Path.
 * @param index Stretch index.
 * @param kind New kind.
 * @returns Changed path; the same path when the kind is unchanged.
 */
export function pathAssetSegmentKindSet(path: PathAsset, index: number, kind: PathAssetSegmentKind): PathAsset {
  if (path.segments[index]?.kind === kind) return path;
  const [start, end] = pathAssetStretchEnds(path, index);
  const third = (from: PathAssetPoint, to: PathAssetPoint): PathAssetPoint => pathAssetLerpOffset(from, to, 1 / 3);
  return pathAssetSegmentSet(path, index, {
    kind,
    out: third(start, end),
    in: third(end, start),
    control: [0, 0, 0],
    degrees: PATH_ASSET_ARC_DEGREES,
    axis: PATH_ASSET_ARC_AXIS,
  });
}

/**
 * Returns where the handles of a stretch are: Control for Quadratic, Out and In
 * for Bezier, none for the other kinds.
 *
 * @param path Path.
 * @param index Stretch index.
 * @returns Handles.
 */
export function pathAssetHandles(path: PathAsset, index: number): PathAssetHandlePlace[] {
  const segment = path.segments[index];
  const handles: PathAssetHandle[] =
    segment?.kind === 'Quadratic' ? ['control'] : segment?.kind === 'Bezier' ? ['out', 'in'] : [];
  return handles.map((handle) => {
    const base = pathAssetHandleBase(path, index, handle);
    const offset = segment?.[handle] ?? [0, 0, 0];
    return { handle, point: [base[0] + offset[0], base[1] + offset[1], base[2] + offset[2]] };
  });
}

/**
 * Drags a handle of a stretch to a point.
 *
 * @param path Path.
 * @param index Stretch index.
 * @param handle Handle.
 * @param point Point the handle moves to.
 * @returns Changed path.
 */
export function pathAssetHandleSet(
  path: PathAsset,
  index: number,
  handle: PathAssetHandle,
  point: PathAssetPoint,
): PathAsset {
  const segment = path.segments[index];
  if (!segment) return path;
  const base = pathAssetHandleBase(path, index, handle);
  return pathAssetSegmentSet(path, index, {
    ...segment,
    [handle]: [point[0] - base[0], point[1] - base[1], point[2] - base[2]],
  });
}

/**
 * Returns the point a handle's offset is measured from: the middle of the
 * stretch for Control, its start for Out and its end for In.
 *
 * @param path Path.
 * @param index Stretch index.
 * @param handle Handle.
 * @returns Base point.
 */
function pathAssetHandleBase(path: PathAsset, index: number, handle: PathAssetHandle): PathAssetPoint {
  const [start, end] = pathAssetStretchEnds(path, index);
  if (handle === 'out') return start;
  if (handle === 'in') return end;
  const half = pathAssetLerpOffset(start, end, 1 / 2);
  return [start[0] + half[0], start[1] + half[1], start[2] + half[2]];
}

/**
 * Returns the points a stretch runs between.
 *
 * @param path Path.
 * @param index Stretch index.
 * @returns Start and end.
 */
export function pathAssetStretchEnds(path: PathAsset, index: number): [PathAssetPoint, PathAssetPoint] {
  return [path.points[index] ?? [0, 0, 0], path.points[(index + 1) % path.points.length] ?? [0, 0, 0]];
}

/**
 * Returns a part of the way from one point to another, as an offset.
 *
 * @param from Start.
 * @param to End.
 * @param part Part of the way.
 * @returns Offset from the start.
 */
function pathAssetLerpOffset(from: PathAssetPoint, to: PathAssetPoint, part: number): PathAssetPoint {
  return [(to[0] - from[0]) * part, (to[1] - from[1]) * part, (to[2] - from[2]) * part];
}
