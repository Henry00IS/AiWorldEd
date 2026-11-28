import type { SolidScriptPath, SolidScriptPathSegment } from './solid_script_path_model.js';
import {
  solidScriptPathClosedSet,
  solidScriptPathResolutionOf,
  solidScriptPathTyped,
} from './solid_script_path_handles.js';
import { solidScriptPathHandleTypesOf, type SolidScriptPathHandleTypes } from './solid_script_path_handle_types.js';

/** Farthest apart, in metres, two end points still count as one place. */
const SOLID_SCRIPT_PATH_JOIN_SAME = 1e-9;

/** A path with no points, which every join treats as not there. */
const SOLID_SCRIPT_PATH_NONE: SolidScriptPath<number[]> = { points: [], segments: [], closed: false };

/**
 * Makes a path of straight and Bezier stretches: a Catmull Rom or NURBS path
 * becomes Bezier the way Set Path Type makes it, and any other path stays.
 *
 * @param path Path.
 * @returns Path with no whole-path curve.
 */
function solidScriptPathJoinPlain(path: SolidScriptPath<number[]>): SolidScriptPath<number[]> {
  if (!path.spline) return path;
  return solidScriptPathTyped(path, 'Bezier', solidScriptPathResolutionOf(path));
}

/**
 * Cuts the points from one number up to another out of an open path, with the
 * stretches between them and what each point carries.
 *
 * @param path Open path with no whole-path curve.
 * @param from First point number.
 * @param to Number after the last point.
 * @returns Part of the path, open.
 */
function solidScriptPathJoinSlice(
  path: SolidScriptPath<number[]>,
  from: number,
  to: number,
): SolidScriptPath<number[]> {
  if (to <= from) return SOLID_SCRIPT_PATH_NONE;
  const types = path.handleTypes;
  const { normal } = path;
  return {
    points: path.points.slice(from, to),
    segments: path.segments.slice(from, to - 1),
    closed: false,
    ...(path.resolution === undefined ? {} : { resolution: path.resolution }),
    ...(path.tilts ? { tilts: path.tilts.slice(from, to) } : {}),
    ...(types ? { handleTypes: { left: types.left.slice(from, to), right: types.right.slice(from, to) } } : {}),
    ...(normal?.mode === 'Free' ? { normal: { mode: 'Free' as const, normals: normal.normals.slice(from, to) } } : {}),
    ...(normal?.mode === 'Up' ? { normal } : {}),
  };
}

/**
 * Tells whether the end of one path and the start of the next are one place.
 *
 * @param first Path that comes first.
 * @param second Path that comes after.
 * @returns True when they share a point.
 */
function solidScriptPathJoinMeets(first: SolidScriptPath<number[]>, second: SolidScriptPath<number[]>): boolean {
  const end = first.points.at(-1) ?? [];
  const start = second.points[0] ?? [];
  return end.every((value, axis) => Math.abs(value - (start[axis] ?? value)) <= SOLID_SCRIPT_PATH_JOIN_SAME);
}

/**
 * Joins the tilts of two paths, or none when neither has any.
 *
 * @param first Path that comes first.
 * @param second Path that comes after.
 * @param skip Points of the second path that are shared and not repeated.
 * @returns Tilts, where either path has them.
 */
function solidScriptPathJoinTilts(
  first: SolidScriptPath<number[]>,
  second: SolidScriptPath<number[]>,
  skip: number,
): Pick<SolidScriptPath<number[]>, 'tilts'> {
  if (!first.tilts && !second.tilts) return {};
  const tilts = (path: SolidScriptPath<number[]>) => path.points.map((_, index) => path.tilts?.[index] ?? 0);
  return { tilts: [...tilts(first), ...tilts(second).slice(skip)] };
}

/**
 * Joins the handle types of two paths, none when neither has any; a shared
 * point is reached with the first path's left type and left with the second's
 * right type.
 *
 * @param first Path that comes first.
 * @param second Path that comes after.
 * @param skip Points of the second path that are shared and not repeated.
 * @returns Handle types, where either path has them.
 */
function solidScriptPathJoinTypes(
  first: SolidScriptPath<number[]>,
  second: SolidScriptPath<number[]>,
  skip: number,
): { handleTypes?: SolidScriptPathHandleTypes } {
  if (!first.handleTypes && !second.handleTypes) return {};
  const before = solidScriptPathHandleTypesOf(first);
  const after = solidScriptPathHandleTypesOf(second);
  return {
    handleTypes: {
      left: [...before.left, ...after.left.slice(skip)],
      right: [...before.right.slice(0, before.right.length - skip), ...after.right],
    },
  };
}

/**
 * Joins the normals of two paths: kept when both are Up, or both Free; any
 * other mix goes back to turning as little as it can.
 *
 * @param first Path that comes first.
 * @param second Path that comes after.
 * @param skip Points of the second path that are shared and not repeated.
 * @returns Normal, where both paths agree.
 */
function solidScriptPathJoinNormal(
  first: SolidScriptPath<number[]>,
  second: SolidScriptPath<number[]>,
  skip: number,
): Pick<SolidScriptPath<number[]>, 'normal'> {
  const [a, b] = [first.normal, second.normal];
  if (a?.mode === 'Up' && b?.mode === 'Up') return { normal: a };
  if (a?.mode !== 'Free' || b?.mode !== 'Free') return {};
  return { normal: { mode: 'Free', normals: [...a.normals, ...b.normals.slice(skip)] } };
}

/**
 * Puts one open path after another. Where the first ends at the place the
 * second starts, that point is kept once; else a straight stretch joins them.
 *
 * @param first Open path that comes first.
 * @param second Open path that comes after.
 * @returns Open path.
 */
function solidScriptPathJoinAppend(
  first: SolidScriptPath<number[]>,
  second: SolidScriptPath<number[]>,
): SolidScriptPath<number[]> {
  if (first.points.length === 0) return second;
  if (second.points.length === 0) return first;
  const skip = solidScriptPathJoinMeets(first, second) ? 1 : 0;
  const bridge: SolidScriptPathSegment<number[]>[] = skip ? [] : [{ kind: 'line' }];
  const resolution = first.resolution ?? second.resolution;
  return {
    points: [...first.points, ...second.points.slice(skip)],
    segments: [...first.segments, ...bridge, ...second.segments],
    closed: false,
    ...(resolution === undefined ? {} : { resolution }),
    ...solidScriptPathJoinTilts(first, second, skip),
    ...solidScriptPathJoinTypes(first, second, skip),
    ...solidScriptPathJoinNormal(first, second, skip),
  };
}

/**
 * Stops on a path that is closed, since a closed path has no ends to join to.
 *
 * @param path Path.
 * @param name What it is called in the message.
 * @param label Command, for messages.
 */
function solidScriptPathJoinOpen(path: SolidScriptPath<number[]>, name: string, label: string): void {
  if (path.closed)
    throw new Error(`${label} needs open paths, but ${name} is closed; open it first with Set Path Closed to No`);
}

/**
 * Checks a position among a path's points.
 *
 * @param at Position given.
 * @param count Points the path has.
 */
function solidScriptPathInsertAt(at: number | undefined, count: number): asserts at is number {
  if (at === undefined || !Number.isInteger(at) || at < 0 || at > count)
    throw new Error(
      `Position needs a whole number from 0 to ${count}, because the path has ${count} points, not ${at ?? 'a missing number'}`,
    );
}

/**
 * Puts open paths into a path after the given number of its points. A Catmull
 * Rom or NURBS path among them first becomes Bezier, as Set Path Type does it;
 * straight and Bezier stretches mix as they are. The stretch the paths go into
 * is replaced by straight stretches to and from them. The tilts, handle types
 * and handles they carry stay; a normal stays only when every path has the same
 * kind. The result is closed when the path is, running on from its last point
 * back to its first, with a straight stretch where the paths went in at its
 * start or end.
 *
 * @param base Path to put them into.
 * @param others Open paths, put in one after another in this order.
 * @param at Points of base before them, from 0 to its point count.
 * @param label Command, for messages.
 * @returns Path.
 */
export function solidScriptPathInsert(
  base: SolidScriptPath<number[]>,
  others: readonly SolidScriptPath<number[]>[],
  at: number | undefined,
  label: string,
): SolidScriptPath<number[]> {
  solidScriptPathInsertAt(at, base.points.length);
  others.forEach((path, index) =>
    solidScriptPathJoinOpen(path, others.length === 1 ? 'the path to add' : `path ${index + 1} to add`, label),
  );
  const plain = solidScriptPathJoinPlain(base);
  const closing = plain.closed ? plain.segments.at(-1) : undefined;
  const open = solidScriptPathClosedSet(plain, false);
  const parts = [
    solidScriptPathJoinSlice(open, 0, at),
    ...others.map(solidScriptPathJoinPlain),
    solidScriptPathJoinSlice(open, at, open.points.length),
  ];
  const joined = parts.reduce(solidScriptPathJoinAppend, SOLID_SCRIPT_PATH_NONE);
  const resolution = plain.resolution ?? joined.resolution;
  const stored = resolution === undefined ? {} : { resolution };
  if (!plain.closed || joined.points.length === 0) return { ...joined, ...stored, closed: plain.closed };
  const inside = at > 0 && at < plain.points.length && closing !== undefined;
  const last: SolidScriptPathSegment<number[]> = inside ? closing : { kind: 'line' };
  return { ...joined, ...stored, segments: [...joined.segments, last], closed: true };
}

/**
 * Joins open paths onto an open path: after its last point, or before its
 * first. It is solidScriptPathInsert at the end or at 0.
 *
 * @param base Open path to join them to.
 * @param others Open paths, joined one after another in this order.
 * @param atEnd True to add them after base, false to put them before it.
 * @param label Command, for messages.
 * @returns Open path.
 */
export function solidScriptPathJoin(
  base: SolidScriptPath<number[]>,
  others: readonly SolidScriptPath<number[]>[],
  atEnd: boolean,
  label: string,
): SolidScriptPath<number[]> {
  solidScriptPathJoinOpen(base, 'the first path', label);
  return solidScriptPathInsert(base, others, atEnd ? base.points.length : 0, label);
}
