/** One control point of a path, in the coordinates of whoever owns the path. */
export interface PathPoint {
  x: number;
  y: number;
  z: number;
}

/**
 * A 3D path: an ordered list of control points that is either a polyline
 * through them or a smooth curve through them, open or closed. Paths are plain
 * values: they are stored inside the objects and modifiers that use them, so
 * copying the owner copies the path.
 */
export interface Path {
  /** Control points in order; at least two. */
  points: PathPoint[];
  /** True joins the last point back to the first. */
  closed: boolean;
  /** True draws a smooth curve through the points instead of straight spans. */
  smooth: boolean;
}

/** Most control points one path keeps. */
export const PATH_MAX_POINTS = 64;

/** Largest coordinate a path point keeps, in meters. */
const PATH_COORDINATE_LIMIT = 100000;

/**
 * Creates a path.
 *
 * @param points Control points as [x, y, z] triples.
 * @param options Closed and smooth flags; open and smooth by default.
 * @returns Normalized path.
 */
export function pathCreate(
  points: readonly (readonly [number, number, number])[],
  options: Partial<Pick<Path, 'closed' | 'smooth'>> = {},
): Path {
  return pathNormalize({
    points: points.map(([x, y, z]) => ({ x, y, z })),
    closed: options.closed ?? false,
    smooth: options.smooth ?? true,
  });
}

/** Path used when a stored path is missing or broken: a 4 m straight line. */
export function pathFallback(): Path {
  return {
    points: [
      { x: 0, y: 0, z: 0 },
      { x: 4, y: 0, z: 0 },
    ],
    closed: false,
    smooth: false,
  };
}

/**
 * Normalizes untrusted path data: finite clamped coordinates, at most
 * {@link PATH_MAX_POINTS} points, and the fallback line when fewer than two
 * usable points remain.
 *
 * @param input Candidate path.
 * @returns Valid path.
 */
export function pathNormalize(input: unknown): Path {
  const record = (typeof input === 'object' && input !== null ? input : {}) as Partial<Record<keyof Path, unknown>>;
  const raw = Array.isArray(record.points) ? record.points : [];
  const points: PathPoint[] = [];
  for (const candidate of raw.slice(0, PATH_MAX_POINTS)) {
    const point = pathPointNormalize(candidate);
    if (point) points.push(point);
  }
  if (points.length < 2) return pathFallback();
  return { points, closed: record.closed === true, smooth: record.smooth === true };
}

/**
 * Normalizes one point.
 *
 * @param input Candidate point.
 * @returns Point, or null when a coordinate is not a finite number.
 */
function pathPointNormalize(input: unknown): PathPoint | null {
  const record = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  const values = [record['x'], record['y'], record['z']];
  if (!values.every((value) => typeof value === 'number' && Number.isFinite(value))) return null;
  const [x, y, z] = (values as number[]).map((value) =>
    Math.max(-PATH_COORDINATE_LIMIT, Math.min(PATH_COORDINATE_LIMIT, value)),
  );
  return { x: x!, y: y!, z: z! };
}

/**
 * Encodes a path as compact text for storage in a parameter, a file or the
 * network: `{"p":[x,y,z,...],"c":0|1,"s":0|1}` with rounded coordinates.
 *
 * @param path Path.
 * @returns Encoded path.
 */
export function pathEncode(path: Path): string {
  const round = (value: number): number => Math.round(value * 1e5) / 1e5 || 0;
  const p = path.points.flatMap((point) => [round(point.x), round(point.y), round(point.z)]);
  return JSON.stringify({ p, c: path.closed ? 1 : 0, s: path.smooth ? 1 : 0 });
}

/**
 * Decodes an encoded path.
 *
 * @param text Encoded path.
 * @returns Normalized path, or null when the text is no path.
 */
export function pathDecode(text: unknown): Path | null {
  if (typeof text !== 'string' || text.length === 0 || text.length > 65536) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const record = (typeof parsed === 'object' && parsed !== null ? parsed : {}) as Record<string, unknown>;
  const flat = record['p'];
  if (!Array.isArray(flat) || flat.length < 6) return null;
  const points: PathPoint[] = [];
  for (let index = 0; index + 2 < flat.length; index += 3)
    points.push({ x: flat[index] as number, y: flat[index + 1] as number, z: flat[index + 2] as number });
  return pathNormalize({ points, closed: record['c'] === 1, smooth: record['s'] === 1 });
}

/**
 * Returns the canonical encoding of any stored value, so equal paths compare
 * equal as text.
 *
 * @param value Stored value.
 * @returns Encoded path; the fallback line for anything that is no path.
 */
export function pathCanonical(value: unknown): string {
  return pathEncode(pathDecode(value) ?? pathFallback());
}
