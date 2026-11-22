import {
  solidScriptPathStraight,
  type SolidScriptPath,
  type SolidScriptPathSegment,
} from './solid_script_path_model.js';
import { SOLID_SCRIPT_PATH_NURBS_ORDER, solidScriptPathCatmullHandles } from './solid_script_path_splines.js';

/** What Set Path Type can make a path. */
export type SolidScriptPathType = 'Poly' | 'Bezier' | 'Catmull Rom' | 'NURBS';

/** Every type Set Path Type can make a path. */
export const SOLID_SCRIPT_PATH_TYPES: readonly SolidScriptPathType[] = ['Poly', 'Bezier', 'Catmull Rom', 'NURBS'];

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
 * on the side with no stretch, and a Catmull Rom path gives the handles that
 * keep its shape.
 *
 * @param path Path.
 * @returns Handles.
 */
export function solidScriptPathHandles(path: SolidScriptPath<number[]>): SolidScriptPathHandles {
  if (path.spline?.kind === 'catmull') return solidScriptPathCatmullHandles(path.points, path.closed);
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
  return { ...solidScriptPathPlain(path), segments };
}

/**
 * Copies a path without its whole-path curve, keeping its points, segments,
 * closing and tilts.
 *
 * @param path Path.
 * @returns Path.
 */
function solidScriptPathPlain(path: SolidScriptPath<number[]>): SolidScriptPath<number[]> {
  return {
    points: path.points,
    segments: path.segments,
    closed: path.closed,
    ...(path.tilts ? { tilts: path.tilts } : {}),
  };
}

/**
 * Makes a path NURBS of order 4. A straight one keeps its points as they are,
 * pinned to its ends when open. A curved one keeps its shape: each point and
 * its two handles become three points in Bezier knots.
 *
 * @param path Path.
 * @param resolution Steps each stretch is sampled in.
 * @returns Path.
 */
function solidScriptPathNurbs(path: SolidScriptPath<number[]>, resolution: number): SolidScriptPath<number[]> {
  const order = SOLID_SCRIPT_PATH_NURBS_ORDER;
  if (path.spline?.kind === 'nurbs') return { ...path, spline: { ...path.spline, resolution } };
  if (!path.spline && path.segments.every((segment) => segment.kind === 'line'))
    return { ...path, spline: { kind: 'nurbs', resolution, order, knots: path.closed ? 'Normal' : 'Endpoint' } };
  const handles = solidScriptPathHandles(path);
  const points = path.points.flatMap((point, index) => [
    handles.left[index] ?? point,
    point,
    handles.right[index] ?? point,
  ]);
  const tilts = path.tilts?.flatMap((tilt) => [tilt, tilt, tilt]);
  return {
    ...solidScriptPathStraight(points, path.closed),
    ...(tilts ? { tilts } : {}),
    spline: { kind: 'nurbs', resolution, order, knots: 'Bezier' },
  };
}

/**
 * Changes how a path runs between its points. Poly makes it straight and
 * Catmull Rom curves it through every point, both keeping the points. Bezier
 * keeps the shape of a curved path and handles, and gives a straight one
 * handles a third of the way along. NURBS is as solidScriptPathNurbs.
 *
 * @param path Path.
 * @param type Type to make it.
 * @param resolution Steps each stretch is sampled in.
 * @returns Path.
 */
export function solidScriptPathTyped(
  path: SolidScriptPath<number[]>,
  type: SolidScriptPathType,
  resolution: number,
): SolidScriptPath<number[]> {
  if (type === 'Bezier') return solidScriptPathWithHandles(path, solidScriptPathHandles(path), resolution);
  if (type === 'NURBS') return solidScriptPathNurbs(path, resolution);
  const straight = { ...solidScriptPathPlain(path), segments: path.segments.map(() => ({ kind: 'line' as const })) };
  return type === 'Poly' ? straight : { ...straight, spline: { kind: 'catmull', resolution } };
}

/**
 * Makes the stretch that joins the last point of a path back to its first:
 * straight on a straight path, else a Bezier stretch with handles a third of
 * the way along it.
 *
 * @param path Open path.
 * @returns Stretch.
 */
function solidScriptPathClosing(path: SolidScriptPath<number[]>): SolidScriptPathSegment<number[]> {
  const curved = path.segments.find((segment) => segment.kind === 'bezier');
  const last = path.points.at(-1) ?? [];
  const first = path.points[0] ?? last;
  if (!curved || path.spline) return { kind: 'line' };
  return { ...curved, out: solidScriptPathThird(last, first), in: solidScriptPathThird(first, last) };
}

/**
 * Joins the last point of a path back to its first, or opens it there. A NURBS
 * path that runs through its ends when open runs freely around when closed.
 *
 * @param path Path.
 * @param closed True to close it.
 * @returns Path, the same one when it already is so.
 */
export function solidScriptPathClosedSet(path: SolidScriptPath<number[]>, closed: boolean): SolidScriptPath<number[]> {
  if (path.closed === closed) return path;
  const segments = closed ? [...path.segments, solidScriptPathClosing(path)] : path.segments.slice(0, -1);
  const spline = path.spline;
  if (spline?.kind !== 'nurbs' || spline.knots === 'Bezier') return { ...path, segments, closed };
  return { ...path, segments, closed, spline: { ...spline, knots: closed ? 'Normal' : 'Endpoint' } };
}

/**
 * Reads the steps each curved stretch of a path is drawn in: those of its
 * whole-path curve or of its first Bezier stretch, the default for a straight
 * path.
 *
 * @param path Path.
 * @returns Steps per stretch.
 */
export function solidScriptPathResolutionOf(path: SolidScriptPath<number[]>): number {
  if (path.spline) return path.spline.resolution;
  const curved = path.segments.find((segment) => segment.kind === 'bezier');
  return curved?.kind === 'bezier' ? curved.resolution : (path.resolution ?? SOLID_SCRIPT_PATH_RESOLUTION);
}

/**
 * Draws every curved stretch of a path in other steps, its points and handles
 * kept.
 *
 * @param path Path.
 * @param resolution Steps per stretch.
 * @returns Path.
 */
export function solidScriptPathResolutionSet(
  path: SolidScriptPath<number[]>,
  resolution: number,
): SolidScriptPath<number[]> {
  const segments = path.segments.map((segment) => (segment.kind === 'bezier' ? { ...segment, resolution } : segment));
  return { ...path, segments, resolution, ...(path.spline ? { spline: { ...path.spline, resolution } } : {}) };
}
