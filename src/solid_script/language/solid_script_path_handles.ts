import type { SolidScriptPath, SolidScriptPathSegment } from './solid_script_path_model.js';

/** A path point or handle: X, Y and Z. */
type SolidScriptHandlePoint = number[];

/** The handles of every point of a path. */
export interface SolidScriptPathHandles {
  /** Handle each point is reached from. */
  left: SolidScriptHandlePoint[];
  /** Handle each point leaves toward. */
  right: SolidScriptHandlePoint[];
}

/** Steps a Bezier stretch is sampled in when none is given. */
export const SOLID_SCRIPT_PATH_RESOLUTION = 12;

/**
 * Finds the point a third of the way from one point to another, where a
 * straight stretch keeps its handles.
 *
 * @param from Start.
 * @param to Toward.
 * @returns Point.
 */
function solidScriptPathThird(from: readonly number[], to: readonly number[]): SolidScriptHandlePoint {
  return from.map((value, axis) => value + ((to[axis] ?? value) - value) / 3);
}

/**
 * Reads the handles of one stretch: its own on a Bezier one, else a third of
 * the way along it.
 *
 * @param path Path.
 * @param index Stretch number.
 * @returns Handle it leaves its start toward and handle its end is reached
 *   from.
 */
function solidScriptPathStretchHandles(
  path: SolidScriptPath<number[]>,
  index: number,
): [SolidScriptHandlePoint, SolidScriptHandlePoint] {
  const segment = path.segments[index];
  if (segment?.kind === 'bezier') return [segment.out, segment.in];
  const start = path.points[index] ?? [];
  const end = path.points[(index + 1) % path.points.length] ?? start;
  return [solidScriptPathThird(start, end), solidScriptPathThird(end, start)];
}

/**
 * Reads the handles of every point; an open path's ends keep the point itself
 * on the side with no stretch.
 *
 * @param path Path.
 * @returns Handles.
 */
export function solidScriptPathHandles(path: SolidScriptPath<number[]>): SolidScriptPathHandles {
  const count = path.segments.length;
  const left = path.points.map((point, index) => {
    const before = index === 0 ? (path.closed ? count - 1 : -1) : index - 1;
    return before < 0 ? [...point] : solidScriptPathStretchHandles(path, before)[1];
  });
  const right = path.points.map((point, index) =>
    index < count ? solidScriptPathStretchHandles(path, index)[0] : [...point],
  );
  return { left, right };
}

/**
 * Makes every stretch a Bezier one between the given handles.
 *
 * @param path Path.
 * @param handles Handles of every point.
 * @param resolution Steps each stretch is sampled in.
 * @returns Path.
 */
export function solidScriptPathWithHandles(
  path: SolidScriptPath<number[]>,
  handles: SolidScriptPathHandles,
  resolution: number,
): SolidScriptPath<number[]> {
  const segments = path.segments.map((_, index): SolidScriptPathSegment<number[]> => ({
    kind: 'bezier',
    out: handles.right[index] ?? [],
    in: handles.left[(index + 1) % path.points.length] ?? [],
    resolution,
  }));
  return { ...path, segments };
}

/**
 * Turns a path straight between its points, or into Bezier stretches that keep
 * its shape and handles.
 *
 * @param path Path.
 * @param type Poly or Bezier.
 * @param resolution Steps each Bezier stretch is sampled in.
 * @returns Path.
 */
export function solidScriptPathTyped(
  path: SolidScriptPath<number[]>,
  type: 'Poly' | 'Bezier',
  resolution: number,
): SolidScriptPath<number[]> {
  if (type === 'Bezier') return solidScriptPathWithHandles(path, solidScriptPathHandles(path), resolution);
  return { ...path, segments: path.segments.map(() => ({ kind: 'line' as const })) };
}
