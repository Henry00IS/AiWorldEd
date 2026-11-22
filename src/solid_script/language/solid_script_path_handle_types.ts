import * as THREE from 'three';
import type { SolidScriptPathHandles } from './solid_script_path_handles.js';
import type { SolidScriptPath } from './solid_script_path_model.js';

/** Ways Set Handle Type places handles. */
export const SOLID_SCRIPT_HANDLE_TYPES = ['Auto', 'Vector', 'Align', 'Free'] as const;

/** One of the handle types. */
export type SolidScriptHandleType = (typeof SOLID_SCRIPT_HANDLE_TYPES)[number];

/** Which handles of a point Set Handle Type changes. */
export const SOLID_SCRIPT_HANDLE_SIDES = ['Both', 'Left', 'Right'] as const;

/** One of the handle sides. */
export type SolidScriptHandleSide = (typeof SOLID_SCRIPT_HANDLE_SIDES)[number];

/**
 * How much shorter than the stretch beside it an Auto handle is, per unit of
 * the summed directions to its neighbours; it makes a run of evenly spaced
 * points on a circle sample close to the circle.
 */
const SOLID_SCRIPT_HANDLE_AUTO_SHORTEN = 2.5614;

/** The point, the one before and the one after, as vectors. */
interface SolidScriptHandleAround {
  point: THREE.Vector3;
  before: THREE.Vector3;
  after: THREE.Vector3;
}

/**
 * Reads a point with its neighbours; an open path's ends mirror their one
 * neighbour through themselves.
 *
 * @param path Path.
 * @param index Point number.
 * @returns The point and its neighbours.
 */
function solidScriptHandleAround(path: SolidScriptPath<number[]>, index: number): SolidScriptHandleAround {
  const count = path.points.length;
  const vector = (at: number): THREE.Vector3 => new THREE.Vector3(...(path.points[(at + count) % count] ?? [0, 0, 0]));
  const point = vector(index);
  const mirror = (other: THREE.Vector3): THREE.Vector3 => point.clone().multiplyScalar(2).sub(other);
  const before = path.closed || index > 0 ? vector(index - 1) : mirror(vector(index + 1));
  const after = path.closed || index < count - 1 ? vector(index + 1) : mirror(vector(index - 1));
  return { point, before, after };
}

/**
 * Places both Auto handles of a point along the sum of the unit directions from
 * the point before and to the point after, each as long as its own stretch,
 * held to five times the other, over the shortening.
 *
 * @param around The point and its neighbours.
 * @returns Left and right handle, or none when the directions cancel.
 */
function solidScriptHandleAuto(around: SolidScriptHandleAround): [THREE.Vector3, THREE.Vector3] | undefined {
  const fromBefore = around.point.clone().sub(around.before);
  const toAfter = around.after.clone().sub(around.point);
  const beforeLength = fromBefore.length() || 1;
  const afterLength = toAfter.length() || 1;
  const direction = toAfter.divideScalar(afterLength).add(fromBefore.divideScalar(beforeLength));
  const scale = direction.length() * SOLID_SCRIPT_HANDLE_AUTO_SHORTEN;
  if (scale === 0) return undefined;
  const left = around.point.clone().addScaledVector(direction, -Math.min(beforeLength, afterLength * 5) / scale);
  const right = around.point.clone().addScaledVector(direction, Math.min(afterLength, beforeLength * 5) / scale);
  return [left, right];
}

/**
 * Turns one handle to point straight away from the other, keeping its length; a
 * handle with nothing to point away from stays.
 *
 * @param point The point.
 * @param other The handle to point away from.
 * @param handle The handle to turn.
 * @returns Turned handle.
 */
function solidScriptHandleOpposite(point: THREE.Vector3, other: THREE.Vector3, handle: THREE.Vector3): THREE.Vector3 {
  const direction = other.clone().sub(point);
  if (direction.lengthSq() === 0) return handle;
  return point.clone().addScaledVector(direction.normalize(), -handle.distanceTo(point));
}

/**
 * Turns both handles of a point into one line through it, keeping their lengths
 * and the plane they lie in; a handle of no length takes the other's length and
 * direction, mirrored.
 *
 * @param point The point.
 * @param left Left handle.
 * @param right Right handle.
 * @returns Aligned left and right handle.
 */
function solidScriptHandleAlignBoth(
  point: THREE.Vector3,
  left: THREE.Vector3,
  right: THREE.Vector3,
): [THREE.Vector3, THREE.Vector3] {
  const toLeft = left.clone().sub(point);
  const toRight = right.clone().sub(point);
  const [leftLength, rightLength] = [toLeft.length(), toRight.length()];
  if (leftLength === 0 || rightLength === 0) {
    if (leftLength === rightLength) return [left, right];
    return leftLength === 0 ? [point.clone().sub(toRight), right] : [left, point.clone().sub(toLeft)];
  }
  const middle = toLeft.clone().normalize().add(toRight.clone().normalize());
  if (middle.length() <= 0.0001 * (leftLength + rightLength)) return [left, right];
  middle.normalize();
  const square = (offset: THREE.Vector3, length: number): THREE.Vector3 =>
    point.clone().addScaledVector(offset.addScaledVector(middle, -offset.dot(middle)).normalize(), length);
  return [square(toLeft, leftLength), square(toRight, rightLength)];
}

/**
 * Works out both handles one type would give a point, before the side is
 * picked.
 *
 * @param type Handle type.
 * @param side Which handles change; Align lines up both, or turns one away from
 *   the other.
 * @param around The point and its neighbours.
 * @param kept Left and right handle now.
 * @returns Left and right handle, or none to keep both.
 */
function solidScriptHandlePlaced(
  type: SolidScriptHandleType,
  side: SolidScriptHandleSide,
  around: SolidScriptHandleAround,
  kept: [THREE.Vector3, THREE.Vector3],
): [THREE.Vector3, THREE.Vector3] | undefined {
  const { point } = around;
  if (type === 'Auto') return solidScriptHandleAuto(around);
  if (type === 'Vector') return [point.clone().lerp(around.before, 1 / 3), point.clone().lerp(around.after, 1 / 3)];
  if (type === 'Free') return undefined;
  if (side === 'Both') return solidScriptHandleAlignBoth(point, kept[0], kept[1]);
  return [solidScriptHandleOpposite(point, kept[1], kept[0]), solidScriptHandleOpposite(point, kept[0], kept[1])];
}

/**
 * Works out the handles one type gives a point, changing only Side.
 *
 * @param type Handle type.
 * @param side Which handles change.
 * @param around The point and its neighbours.
 * @param kept Left and right handle now.
 * @returns New left and right handle.
 */
function solidScriptHandleTyped(
  type: SolidScriptHandleType,
  side: SolidScriptHandleSide,
  around: SolidScriptHandleAround,
  kept: [THREE.Vector3, THREE.Vector3],
): [THREE.Vector3, THREE.Vector3] {
  const placed = solidScriptHandlePlaced(type, side, around, kept);
  if (!placed) return kept;
  return [side === 'Right' ? kept[0] : placed[0], side === 'Left' ? kept[1] : placed[1]];
}

/**
 * Places the handles of the picked points of a path by type: Auto for a smooth
 * curve through the neighbours, Vector a third of the way to each neighbour,
 * Align for handles in one line through the point, and Free to keep them.
 *
 * @param path Path.
 * @param handles Handles now.
 * @param type Handle type.
 * @param side Which handles of a point change.
 * @param picked Whether each point changes.
 * @returns New handles.
 */
export function solidScriptPathHandleTypes(
  path: SolidScriptPath<number[]>,
  handles: SolidScriptPathHandles,
  type: SolidScriptHandleType,
  side: SolidScriptHandleSide,
  picked: readonly boolean[],
): SolidScriptPathHandles {
  const vector = (numbers: readonly number[] | undefined): THREE.Vector3 =>
    new THREE.Vector3(...(numbers ?? [0, 0, 0]));
  const placed = path.points.map((_, index): [THREE.Vector3, THREE.Vector3] => {
    const kept: [THREE.Vector3, THREE.Vector3] = [vector(handles.left[index]), vector(handles.right[index])];
    return picked[index] ? solidScriptHandleTyped(type, side, solidScriptHandleAround(path, index), kept) : kept;
  });
  return { left: placed.map(([left]) => left.toArray()), right: placed.map(([, right]) => right.toArray()) };
}

/** The handle type of each point of a path, on its left and its right. */
export interface SolidScriptPathHandleTypes {
  readonly left: readonly SolidScriptHandleType[];
  readonly right: readonly SolidScriptHandleType[];
}

/**
 * Reads the handle types of every point of a path, Free where none is kept.
 *
 * @param path Path.
 * @returns Handle types.
 */
export function solidScriptPathHandleTypesOf(path: SolidScriptPath<number[]>): SolidScriptPathHandleTypes {
  const kept = path.handleTypes;
  return {
    left: path.points.map((_, index) => kept?.left[index] ?? 'Free'),
    right: path.points.map((_, index) => kept?.right[index] ?? 'Free'),
  };
}

/**
 * Gives the picked points one handle type on the chosen side.
 *
 * @param path Path.
 * @param type Handle type.
 * @param side Which handles of a point change.
 * @param picked Whether each point changes.
 * @returns Handle types.
 */
export function solidScriptPathHandleTypesSet(
  path: SolidScriptPath<number[]>,
  type: SolidScriptHandleType,
  side: SolidScriptHandleSide,
  picked: readonly boolean[],
): SolidScriptPathHandleTypes {
  const now = solidScriptPathHandleTypesOf(path);
  const changed = (types: readonly SolidScriptHandleType[], changes: boolean) =>
    types.map((kept, index) => (changes && picked[index] ? type : kept));
  return { left: changed(now.left, side !== 'Right'), right: changed(now.right, side !== 'Left') };
}

/**
 * Gives handle types that no longer place a handle once it is moved by hand:
 * Auto becomes Align, Vector becomes Free.
 *
 * @param type Handle type.
 * @returns Handle type.
 */
export function solidScriptHandleTypeMoved(type: SolidScriptHandleType): SolidScriptHandleType {
  return type === 'Auto' ? 'Align' : type === 'Vector' ? 'Free' : type;
}

/**
 * Gives the handle types of a path's points after their handles were moved by
 * hand.
 *
 * @param path Path.
 * @returns Handle types.
 */
export function solidScriptPathHandleTypesMoved(path: SolidScriptPath<number[]>): SolidScriptPathHandleTypes {
  const now = solidScriptPathHandleTypesOf(path);
  return { left: now.left.map(solidScriptHandleTypeMoved), right: now.right.map(solidScriptHandleTypeMoved) };
}

/**
 * Gives the handle types a path gets when it is made Bezier: a straight path
 * Vector, a whole-path curve Align, a Bezier path those it has.
 *
 * @param path Path before.
 * @returns Handle types.
 */
export function solidScriptPathHandleTypesBezier(path: SolidScriptPath<number[]>): SolidScriptPathHandleTypes {
  const curved = path.segments.some((segment) => segment.kind === 'bezier');
  if (curved && !path.spline) return solidScriptPathHandleTypesOf(path);
  const type: SolidScriptHandleType = path.spline ? 'Align' : 'Vector';
  return { left: path.points.map(() => type), right: path.points.map(() => type) };
}

/**
 * Gives the handle types of a Bezier path after points were added inside its
 * stretches: new points get Align, and the handles beside a cut stretch keep
 * their type when it can follow the new points, Auto becoming Align and Vector
 * Free.
 *
 * @param path Path before.
 * @param added Points added after each point.
 * @returns Handle types in the new point order, or undefined for a path whose
 *   handles are not its own.
 */
export function solidScriptPathHandleTypesSubdivided(
  path: SolidScriptPath<number[]>,
  added: readonly number[],
): SolidScriptPathHandleTypes | undefined {
  if (path.spline || path.segments.every((segment) => segment.kind === 'line')) return path.handleTypes;
  const now = solidScriptPathHandleTypesOf(path);
  const count = path.points.length;
  const cut = (index: number): boolean => (added[(index + count) % count] ?? 0) > 0 && (path.closed || index >= 0);
  const types = path.points.map((_, index) => ({
    left: cut(index - 1) ? solidScriptHandleTypeMoved(now.left[index] ?? 'Free') : (now.left[index] ?? 'Free'),
    right: cut(index) ? solidScriptHandleTypeMoved(now.right[index] ?? 'Free') : (now.right[index] ?? 'Free'),
  }));
  const order = types.flatMap((type, index) => [
    type,
    ...Array.from({ length: added[index] ?? 0 }, () => ({ left: 'Align' as const, right: 'Align' as const })),
  ]);
  return { left: order.map((type) => type.left), right: order.map((type) => type.right) };
}
