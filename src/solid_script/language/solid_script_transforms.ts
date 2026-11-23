import * as THREE from 'three';
import type { SolidScriptBlockArguments } from './solid_script_block_arguments.js';
import { SOLID_SCRIPT_AXES_UP } from './solid_script_axes.js';
import { SolidScriptRotation } from './solid_script_value.js';

/** Radians per degree. */
const SOLID_SCRIPT_DEGREES = Math.PI / 180;

/**
 * Translation by a distance along X, Y and Z in metres.
 *
 * @param offset Distance along X, Y and Z.
 * @returns Matrix.
 */
export function solidScriptOffsetMatrix(offset: readonly number[]): THREE.Matrix4 {
  const [x, y, z] = [offset[0] ?? 0, offset[1] ?? 0, offset[2] ?? 0];
  return new THREE.Matrix4().makeTranslation(x, y, z);
}

/**
 * Rotation in degrees around X, then Y, then Z.
 *
 * @param angles Degrees around X, then Y, then Z.
 * @returns Matrix.
 */
export function solidScriptRotationDegreesMatrix(angles: readonly number[]): THREE.Matrix4 {
  const [x, y, z] = [angles[0] ?? 0, angles[1] ?? 0, angles[2] ?? 0].map((degrees) => degrees * SOLID_SCRIPT_DEGREES);
  return new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(x, y, z, 'ZYX'));
}

/**
 * Reads the turn of a matrix back as degrees around X, then Y, then Z, the
 * angles solidScriptRotationDegreesMatrix takes.
 *
 * @param matrix Matrix.
 * @returns Degrees around X, Y and Z.
 */
export function solidScriptRotationDegrees(matrix: THREE.Matrix4): number[] {
  const turn = new THREE.Quaternion();
  matrix.decompose(new THREE.Vector3(), turn, new THREE.Vector3());
  const angles = new THREE.Euler().setFromQuaternion(turn, 'ZYX');
  return [angles.x, angles.y, angles.z].map((angle) => angle / SOLID_SCRIPT_DEGREES);
}

/**
 * Matrix of a Move By or Transform Move field.
 *
 * @param args Block fields, key by or move.
 * @param key Field key.
 * @returns Matrix.
 */
export function solidScriptMoveMatrix(args: SolidScriptBlockArguments, key = 'by'): THREE.Matrix4 {
  return solidScriptOffsetMatrix(args.vector(key, [0, 0, 0]));
}

/**
 * Matrix of a Rotate line or a Transform Rotate field: a Rotation, or degrees
 * around X, then Y, then Z.
 *
 * @param args Block fields, key by, to or rotate.
 * @param key Field key.
 * @returns Matrix.
 */
export function solidScriptRotateMatrix(args: SolidScriptBlockArguments, key = 'by'): THREE.Matrix4 {
  const value = args.value(key);
  if (value instanceof SolidScriptRotation)
    return new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion(...value.quaternion));
  return solidScriptRotationDegreesMatrix(args.vector(key, [0, 0, 0]));
}

/** Local axes Align To can point along Direction. */
const SOLID_SCRIPT_ALIGN_AXES: Readonly<Record<string, THREE.Vector3>> = {
  x: new THREE.Vector3(1, 0, 0),
  y: SOLID_SCRIPT_AXES_UP,
  z: new THREE.Vector3(0, 0, 1),
};

/**
 * Matrix of an Align To block: the shortest turn that makes Axis (+Y unless
 * told otherwise) point along the direction, or, for Y with Forward, the turn
 * that also points the front (+Z) along Forward; Amount takes only that share
 * of the turn.
 *
 * @param args Block fields.
 * @returns Matrix.
 */
export function solidScriptAlignMatrix(args: SolidScriptBlockArguments): THREE.Matrix4 {
  const direction = new THREE.Vector3(...args.vector('direction', [0, 1, 0]));
  const typedAxis = args.value('axis');
  const axisName = (typeof typedAxis === 'string' ? typedAxis : 'Y').trim().toLowerCase() || 'y';
  const axis = SOLID_SCRIPT_ALIGN_AXES[axisName];
  if (!axis) throw new Error(`Axis needs X, Y or Z, not ${String(typedAxis)}`);
  const full = axis === SOLID_SCRIPT_AXES_UP ? solidScriptAlignUpMatrix(args, direction) : null;
  const turn = full ? new THREE.Quaternion().setFromRotationMatrix(full) : solidScriptAlignAxisTurn(axis, direction);
  const amount = args.number('amount', 1);
  return new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().slerp(turn, amount));
}

/**
 * The turn that points up (Y) along a direction, with Forward when given.
 *
 * @param args Block fields.
 * @param direction Direction up should point along.
 * @returns Rotation matrix.
 */
function solidScriptAlignUpMatrix(args: SolidScriptBlockArguments, direction: THREE.Vector3): THREE.Matrix4 {
  const up = solidScriptAlignDirectionMatrix(direction);
  const typed = args.value('forward');
  if (typed === undefined || (typeof typed === 'string' && typed.trim() === '')) return up;
  return solidScriptForwardMatrix(direction, new THREE.Vector3(...args.vector('forward', [0, 0, 1]))) ?? up;
}

/**
 * The shortest turn that points a local axis along a direction.
 *
 * @param axis Unit local axis.
 * @param direction Direction it should point along.
 * @returns Turn.
 */
function solidScriptAlignAxisTurn(axis: THREE.Vector3, direction: THREE.Vector3): THREE.Quaternion {
  if (direction.lengthSq() < 1e-18) throw new Error('Direction needs a direction that is not 0, 0, 0');
  return new THREE.Quaternion().setFromUnitVectors(axis, direction.clone().normalize());
}

/**
 * Rotation whose up (Y) points along one direction and whose front (Z) points
 * as close as it can to a second one: the second is laid square to up first.
 * Gives null when the second is 0, 0, 0 or runs along up, so the caller keeps
 * its own turn.
 *
 * @param up Way up should point.
 * @param forward Way the front should point.
 * @returns Rotation, or null.
 */
export function solidScriptForwardMatrix(up: THREE.Vector3, forward: THREE.Vector3): THREE.Matrix4 | null {
  if (up.lengthSq() < 1e-18) return null;
  const y = up.clone().normalize();
  const z = forward.clone().addScaledVector(y, -forward.dot(y));
  if (z.lengthSq() < 1e-12 * Math.max(1, forward.lengthSq())) return null;
  z.normalize();
  return new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(y, z), y, z);
}

/**
 * Matrix that turns up (Y) to point along a direction, by the shortest turn.
 *
 * @param direction Direction up should point along.
 * @returns Rotation matrix.
 */
export function solidScriptAlignDirectionMatrix(direction: THREE.Vector3): THREE.Matrix4 {
  if (direction.lengthSq() < 1e-18) throw new Error('Direction needs a direction that is not 0, 0, 0');
  const turn = new THREE.Quaternion().setFromUnitVectors(SOLID_SCRIPT_AXES_UP, direction.clone().normalize());
  return new THREE.Matrix4().makeRotationFromQuaternion(turn);
}

/**
 * Matrix that stands a shape at a point, with its up along a direction and a
 * lift along that up.
 *
 * @param position Where the origin goes, in metres.
 * @param direction Where up (Y) should point, or null to keep world up.
 * @param lift Metres to move out along up after the turn.
 * @returns Matrix.
 */
export function solidScriptPlaceMatrix(
  position: THREE.Vector3,
  direction: THREE.Vector3 | null,
  lift: number,
): THREE.Matrix4 {
  const offset = new THREE.Matrix4().makeTranslation(0, lift, 0);
  const rotation = direction ? solidScriptAlignDirectionMatrix(direction) : new THREE.Matrix4();
  return new THREE.Matrix4().makeTranslation(position.x, position.y, position.z).multiply(rotation).multiply(offset);
}

/**
 * Matrix of a Scale By line or a Transform Scale field.
 *
 * @param args Block fields, key by or scale.
 * @param key Field key.
 * @returns Matrix.
 */
export function solidScriptScaleMatrix(args: SolidScriptBlockArguments, key = 'by'): THREE.Matrix4 {
  const [x, y, z] = args.vector(key, [1, 1, 1]) as [number, number, number];
  return new THREE.Matrix4().makeScale(x, y, z);
}

/**
 * Matrix of a Mirror block: reflects across the plane through the origin that
 * faces the given direction.
 *
 * @param args Block fields.
 * @returns Matrix.
 */
export function solidScriptMirrorMatrix(args: SolidScriptBlockArguments): THREE.Matrix4 {
  const [x, y, z] = args.vector('v', [1, 0, 0]) as [number, number, number];
  const normal = new THREE.Vector3(x, y, z);
  if (normal.lengthSq() < 1e-12) throw args.error('v', 'must point somewhere', [x, y, z]);
  const n = normal.normalize().toArray();
  const columns = [0, 1, 2].flatMap((column) => [
    ...[0, 1, 2].map((row) => (row === column ? 1 : 0) - 2 * (n[row] ?? 0) * (n[column] ?? 0)),
    0,
  ]);
  return new THREE.Matrix4().fromArray([...columns, 0, 0, 0, 1]);
}
