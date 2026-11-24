import * as THREE from 'three';
import type { SolidScriptBlockRun } from './solid_script_machine_types.js';
import { solidScriptValueTruthy, type SolidScriptValue } from './solid_script_value.js';
import { SOLID_SCRIPT_GEOMETRY_EPSILON } from './solid_script_geometry.js';

/**
 * Degrees a Facing check allows when Within is left off, matching the old
 * Select default.
 */
export const SOLID_SCRIPT_FACING_WITHIN_DEFAULT = 30;

/**
 * Tests one Where condition for a single item. An empty field keeps the item.
 * The field is read with the given bindings, such as $Face and $Index, and must
 * not be read with text() first.
 *
 * @param run Running line.
 * @param field Field name, usually where.
 * @param bindings Values such as $Face and $Index, or what makes them, so an
 *   empty field makes no face, edge or corner value.
 * @returns Whether the condition holds.
 */
export function solidScriptConditionHolds(
  run: SolidScriptBlockRun,
  field: string,
  bindings: Readonly<Record<string, SolidScriptValue>> | (() => Readonly<Record<string, SolidScriptValue>>),
): boolean {
  if (run.source(field).trim() === '') return true;
  return solidScriptValueTruthy(run.valueWith(field, typeof bindings === 'function' ? bindings() : bindings));
}

/**
 * Tells whether a direction faces another, within a number of degrees.
 *
 * @param normal Direction of the thing, such as a face's normal.
 * @param direction Direction it should face.
 * @param within Degrees it may lean, from 0 to 180; 30 when omitted.
 * @returns Yes when it faces that way.
 */
export function solidScriptFacingHolds(
  normal: readonly number[],
  direction: readonly number[],
  within?: number,
): boolean {
  const angle = within ?? SOLID_SCRIPT_FACING_WITHIN_DEFAULT;
  const from = new THREE.Vector3(normal[0], normal[1], normal[2]);
  const toward = new THREE.Vector3(direction[0], direction[1], direction[2]);
  if (from.lengthSq() === 0 || toward.lengthSq() === 0) return false;
  const limit = Math.cos(THREE.MathUtils.degToRad(angle)) - SOLID_SCRIPT_GEOMETRY_EPSILON;
  return from.normalize().dot(toward.normalize()) >= limit;
}

/**
 * Tells whether a point lies in an axis-aligned box of a center and size.
 *
 * @param point Point to test, x, y, z.
 * @param center Center of the box.
 * @param size Width, height and depth; one number is used on every axis.
 * @returns Yes when the point is inside, including the faces of the box.
 */
export function solidScriptInBoxHolds(
  point: readonly number[],
  center: readonly number[],
  size: readonly number[],
): boolean {
  const extent = size.length === 1 ? [size[0], size[0], size[0]] : size;
  for (let axis = 0; axis < 3; axis += 1) {
    const half = Math.abs(extent[axis] ?? 0) / 2;
    if (Math.abs((point[axis] ?? 0) - (center[axis] ?? 0)) > half + SOLID_SCRIPT_GEOMETRY_EPSILON) return false;
  }
  return true;
}

/**
 * Tells whether a point is within a distance of a target.
 *
 * @param point Point to test.
 * @param target Point to measure from.
 * @param distance Greatest distance that still counts, in metres.
 * @returns Yes when the points are that close, including the exact distance.
 */
export function solidScriptNearHolds(point: readonly number[], target: readonly number[], distance: number): boolean {
  const dx = (point[0] ?? 0) - (target[0] ?? 0);
  const dy = (point[1] ?? 0) - (target[1] ?? 0);
  const dz = (point[2] ?? 0) - (target[2] ?? 0);
  return Math.hypot(dx, dy, dz) <= distance + SOLID_SCRIPT_GEOMETRY_EPSILON;
}

/**
 * Tells whether an index is every Nth item, lined up with a start.
 *
 * @param index Item number from 0.
 * @param step How often to keep an item, a whole number of 1 or more.
 * @param start Index the kept items line up with, 0 when omitted.
 * @returns Yes for start, start + step, and so on.
 */
export function solidScriptEveryNthHolds(index: number, step: number, start = 0): boolean {
  const offset = index - start;
  return ((offset % step) + step) % step === 0;
}

/**
 * Tells whether a tag or list of tags includes a name, ignoring case.
 *
 * @param tags A tag, or a list of tags such as [$Face.Tags].
 * @param name Tag to look for, such as Top.
 * @returns Yes when the name is there.
 */
export function solidScriptHasTagHolds(tags: SolidScriptValue, name: string): boolean {
  const wanted = name.trim().toLowerCase();
  const list = Array.isArray(tags) ? tags : [tags];
  return list.some((tag) => typeof tag === 'string' && tag.trim().toLowerCase() === wanted);
}
