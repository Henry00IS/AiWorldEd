import * as THREE from 'three';
import { solidScriptGeometryFrame } from './solid_script_geometry.js';
import type { SolidScriptBlockRun } from './solid_script_machine_types.js';
import { solidScriptAlignDirectionMatrix } from './solid_script_transforms.js';
import { solidScriptValueNumber, solidScriptValueNumbers } from './solid_script_value.js';

/**
 * Reads a list of x, y, z points from a field that already turns text into
 * points.
 *
 * @param run Running line.
 * @param key Field key.
 * @param label Field caption, for messages.
 * @returns Points.
 */
export function solidScriptPlacePoints(run: SolidScriptBlockRun, key: string, label: string): THREE.Vector3[] {
  const listed = run.value(key);
  if (!Array.isArray(listed))
    throw new Error(`${label} needs a list of points, such as [0, 0, 0], [1, 0, 0], not a single value`);
  return listed.map((entry) => solidScriptPlacePoint(entry, label));
}

/**
 * Reads one x, y, z point.
 *
 * @param value Value.
 * @param label Field caption, for messages.
 * @returns Point.
 */
function solidScriptPlacePoint(value: unknown, label: string): THREE.Vector3 {
  if (!Array.isArray(value) || value.length < 3 || value.some((entry) => typeof entry !== 'number'))
    throw new Error(`${label} needs points written as vectors, such as [0, 0, 0], [1, 0, 0]`);
  const x = value[0];
  const y = value[1];
  const z = value[2];
  if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number')
    throw new Error(`${label} needs points written as vectors, such as [0, 0, 0], [1, 0, 0]`);
  return new THREE.Vector3(x, y, z);
}

/**
 * Matrices that stand a shape at each point of a Place At Points line, in the
 * frame of the blocks around it.
 *
 * @param run Running line.
 * @returns One matrix per point.
 */
export function solidScriptPlaceMatrices(run: SolidScriptBlockRun): THREE.Matrix4[] {
  const points = solidScriptPlacePoints(run, 'at', 'At');
  const directions = solidScriptPlaceDirections(run, points.length);
  const lift = solidScriptValueNumber(run.value('lift'));
  if (lift === undefined) throw new Error('Lift needs a number of metres, such as 0');
  const align = solidScriptPlaceAlignOn(run);
  const parent = run.matrix();
  return points.map((point, index) =>
    parent.clone().multiply(solidScriptPlaceCopyMatrix(run, point, directions[index] ?? null, lift, align, index)),
  );
}

/**
 * Reads Align To Normal as Yes or No.
 *
 * @param run Running line.
 * @returns True when Align To Normal is Yes.
 */
function solidScriptPlaceAlignOn(run: SolidScriptBlockRun): boolean {
  const align = run.value('align');
  if (align !== undefined && typeof align !== 'boolean') throw new Error('Align To Normal needs Yes or No');
  return align === true;
}

/**
 * Matrix of one Place At Points copy, before the blocks around it.
 *
 * @param run Running line.
 * @param point Point to stand on.
 * @param direction Up direction, or null for world up.
 * @param lift Metres out along up.
 * @param align True to use the Place On Face frame.
 * @param index Point number from 0.
 * @returns Matrix.
 */
function solidScriptPlaceCopyMatrix(
  run: SolidScriptBlockRun,
  point: THREE.Vector3,
  direction: THREE.Vector3 | null,
  lift: number,
  align: boolean,
  index: number,
): THREE.Matrix4 {
  return solidScriptPlaceAtMatrix(
    point,
    direction,
    lift,
    align,
    solidScriptPlaceEachRotate(run, point, index),
    solidScriptPlaceEachScale(run, point, index),
  );
}

/**
 * Reads optional directions, one per point, or none when the field is empty.
 *
 * @param run Running line.
 * @param count How many points At has.
 * @returns A direction for each point, or an empty list.
 */
function solidScriptPlaceDirections(run: SolidScriptBlockRun, count: number): THREE.Vector3[] {
  if (run.text('directions').trim() === '') return [];
  const directions = solidScriptPlacePoints(run, 'directions', 'Directions');
  if (directions.length !== count)
    throw new Error(
      `Directions needs one direction for each point in At, or leave it empty; At has ${count} and Directions has ${directions.length}`,
    );
  return directions;
}

/** Radians per degree, as the Rotate block uses. */
const SOLID_SCRIPT_PLACE_DEGREES = Math.PI / 180;

/**
 * Rotation that stands a shape with its up (Y) along a direction the way Place
 * On Face does: X across, Y out, Z down the surface.
 *
 * @param direction Way up should point.
 * @returns Rotation.
 */
export function solidScriptPlaceAlignMatrix(direction: THREE.Vector3): THREE.Matrix4 {
  if (direction.lengthSq() < 1e-18) throw new Error('Align To Normal needs a direction that is not 0, 0, 0');
  const normal = direction.clone().normalize();
  const { across, up } = solidScriptGeometryFrame(normal);
  return new THREE.Matrix4().makeBasis(across, normal, up.clone().negate());
}

/**
 * Matrix that stands a shape at a point, with lift, optional align, and a
 * per-point rotation and scale.
 *
 * @param position Where the origin goes, in metres.
 * @param direction Where up (Y) should point, or null to keep world up.
 * @param lift Metres to move out along up after the turn.
 * @param align True to use the Place On Face frame; false uses the shortest
 *   turn.
 * @param rotate Per-point rotation, after the lift.
 * @param scale Per-point scale, after the rotation.
 * @returns Matrix.
 */
export function solidScriptPlaceAtMatrix(
  position: THREE.Vector3,
  direction: THREE.Vector3 | null,
  lift: number,
  align: boolean,
  rotate: THREE.Matrix4,
  scale: THREE.Matrix4,
): THREE.Matrix4 {
  const oriented = !direction
    ? new THREE.Matrix4()
    : align
      ? solidScriptPlaceAlignMatrix(direction)
      : solidScriptAlignDirectionMatrix(direction);
  return new THREE.Matrix4()
    .makeTranslation(position.x, position.y, position.z)
    .multiply(oriented)
    .multiply(new THREE.Matrix4().makeTranslation(0, lift, 0))
    .multiply(rotate)
    .multiply(scale);
}

/**
 * Rotation of one Place At Points copy, from its 🔁 Rotation field.
 *
 * @param run Running line.
 * @param point Current point.
 * @param index Index from 0.
 * @returns Rotation.
 */
function solidScriptPlaceEachRotate(run: SolidScriptBlockRun, point: THREE.Vector3, index: number): THREE.Matrix4 {
  const [x, y, z] = solidScriptPlaceEachVector(run, 'rotation', point, index, [0, 0, 0]);
  return new THREE.Matrix4().makeRotationFromEuler(
    new THREE.Euler(
      x * SOLID_SCRIPT_PLACE_DEGREES,
      y * SOLID_SCRIPT_PLACE_DEGREES,
      z * SOLID_SCRIPT_PLACE_DEGREES,
      'ZYX',
    ),
  );
}

/**
 * Scale of one Place At Points copy, from its 🔁 Scale field.
 *
 * @param run Running line.
 * @param point Current point.
 * @param index Index from 0.
 * @returns Scale.
 */
function solidScriptPlaceEachScale(run: SolidScriptBlockRun, point: THREE.Vector3, index: number): THREE.Matrix4 {
  const [x, y, z] = solidScriptPlaceEachVector(run, 'scale', point, index, [1, 1, 1]);
  return new THREE.Matrix4().makeScale(x, y, z);
}

/**
 * Reads a per-point vector field, with [$Point] the position and [$Index] from
 * 0.
 *
 * @param run Running line.
 * @param key Field key.
 * @param point Current point.
 * @param index Index from 0.
 * @param fallback Value when the field is empty.
 * @returns Three numbers.
 */
function solidScriptPlaceEachVector(
  run: SolidScriptBlockRun,
  key: string,
  point: THREE.Vector3,
  index: number,
  fallback: readonly [number, number, number],
): [number, number, number] {
  const numbers = solidScriptValueNumbers(run.valueWith(key, { $Point: [point.x, point.y, point.z], $Index: index }));
  if (!numbers || numbers.length < 3)
    throw new Error(`${key === 'rotation' ? 'Rotation' : 'Scale'} needs three numbers, such as ${fallback.join(', ')}`);
  const x = numbers[0];
  const y = numbers[1];
  const z = numbers[2];
  if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number')
    throw new Error(`${key === 'rotation' ? 'Rotation' : 'Scale'} needs three numbers, such as ${fallback.join(', ')}`);
  return [x, y, z];
}
