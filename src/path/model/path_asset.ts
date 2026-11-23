/** A point of a path asset: X, Y and Z. */
export type PathAssetPoint = readonly [number, number, number];

/** How one stretch of a path asset runs from a point to the next. */
export const PATH_ASSET_SEGMENT_KINDS = ['Straight', 'Quadratic', 'Bezier', 'Smooth', 'Arc'] as const;

/** One of the segment kinds. */
export type PathAssetSegmentKind = (typeof PATH_ASSET_SEGMENT_KINDS)[number];

/**
 * One stretch of a path asset. Handles are stored as offsets, so a stretch
 * keeps its shape when its points move: Quadratic bends toward Control, an
 * offset from the middle of the stretch; Bezier leaves its start toward Out and
 * comes into its end from In, offsets from those points; Smooth runs through
 * its neighbours like a rope; Arc is an exact circular arc of Degrees, turning
 * about Axis.
 */
export interface PathAssetSegment {
  /** Kind of stretch. */
  readonly kind: PathAssetSegmentKind;
  /** Quadratic handle, as an offset from the middle of the stretch. */
  readonly control?: PathAssetPoint;
  /** Bezier handle leaving the start, as an offset from it. */
  readonly out?: PathAssetPoint;
  /** Bezier handle coming into the end, as an offset from it. */
  readonly in?: PathAssetPoint;
  /** Arc sweep in degrees; negative bends to the other side. */
  readonly degrees?: number;
  /** Arc turning axis; the arc lies square to it. */
  readonly axis?: PathAssetPoint;
}

/** A path drawn in the scene: points joined by one segment per stretch. */
export interface PathAsset {
  /** Points in order. */
  readonly points: readonly PathAssetPoint[];
  /** One per stretch: points less one, or as many as points when closed. */
  readonly segments: readonly PathAssetSegment[];
  /** True when the last point joins back to the first. */
  readonly closed: boolean;
}

/** Steps a curved stretch is drawn in, per quarter turn for an arc. */
export const PATH_ASSET_RESOLUTION = 12;

/** Most points a path asset keeps. */
export const PATH_ASSET_MAX_POINTS = 1024;

/** Arc sweep a new Arc stretch gets, in degrees. */
export const PATH_ASSET_ARC_DEGREES = 90;

/** Axis a new Arc stretch turns about: up, so it lies flat. */
export const PATH_ASSET_ARC_AXIS: PathAssetPoint = [0, 1, 0];

/** Path an input starts with: one straight stretch two metres long. */
export const PATH_ASSET_DEFAULT: PathAsset = {
  points: [
    [-1, 0, 0],
    [1, 0, 0],
  ],
  segments: [{ kind: 'Straight' }],
  closed: false,
};

/**
 * Returns how many stretches a path with a number of points has.
 *
 * @param count Point count.
 * @param closed True when the last point joins back to the first.
 * @returns Stretch count.
 */
export function pathAssetStretchCount(count: number, closed: boolean): number {
  return closed && count > 2 ? count : Math.max(0, count - 1);
}

/**
 * Reads a path asset from stored data, keeping what is valid: points of three
 * finite numbers, one segment per stretch (Straight where one is missing or
 * unknown), and Closed only with three points or more.
 *
 * @param data Parsed data.
 * @returns Path, or null without two valid points.
 */
export function pathAssetFromData(data: unknown): PathAsset | null {
  const record = (data ?? {}) as Partial<Record<keyof PathAsset, unknown>>;
  const points = (Array.isArray(record.points) ? record.points : [])
    .map(pathAssetPointRead)
    .filter((point): point is PathAssetPoint => point !== null)
    .slice(0, PATH_ASSET_MAX_POINTS);
  if (points.length < 2) return null;
  const closed = record.closed === true && points.length > 2;
  const given = Array.isArray(record.segments) ? record.segments : [];
  const segments = Array.from({ length: pathAssetStretchCount(points.length, closed) }, (_, index) =>
    pathAssetSegmentRead(given[index]),
  );
  return { points, segments, closed };
}

/**
 * Writes a path asset as compact text, as a Path input stores it.
 *
 * @param path Path.
 * @returns Text.
 */
export function pathAssetEncode(path: PathAsset): string {
  return JSON.stringify(path);
}

/**
 * Reads a path asset from text a Path input stored.
 *
 * @param text Text.
 * @returns Path, or null when the text holds none.
 */
export function pathAssetDecode(text: string): PathAsset | null {
  try {
    return pathAssetFromData(JSON.parse(text));
  } catch {
    return null;
  }
}

/**
 * Reads one point: three finite numbers.
 *
 * @param value Stored point.
 * @returns Point, or null.
 */
function pathAssetPointRead(value: unknown): PathAssetPoint | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const [x, y, z] = value.map(Number);
  return [x, y, z].every((each) => Number.isFinite(each)) ? [x!, y!, z!] : null;
}

/**
 * Reads one segment, keeping only the settings of its kind; an unknown kind is
 * Straight.
 *
 * @param value Stored segment.
 * @returns Segment.
 */
function pathAssetSegmentRead(value: unknown): PathAssetSegment {
  const record = (value ?? {}) as Partial<Record<keyof PathAssetSegment, unknown>>;
  const kind = PATH_ASSET_SEGMENT_KINDS.find((each) => each === record.kind) ?? 'Straight';
  const point = (stored: unknown): PathAssetPoint => pathAssetPointRead(stored) ?? [0, 0, 0];
  if (kind === 'Quadratic') return { kind, control: point(record.control) };
  if (kind === 'Bezier') return { kind, out: point(record.out), in: point(record.in) };
  if (kind !== 'Arc') return { kind };
  const degrees = Number(record.degrees);
  const sweep =
    Number.isFinite(degrees) && Math.abs(degrees) >= 1 && Math.abs(degrees) <= 359 ? degrees : PATH_ASSET_ARC_DEGREES;
  return { kind, degrees: sweep, axis: pathAssetPointRead(record.axis) ?? PATH_ASSET_ARC_AXIS };
}
