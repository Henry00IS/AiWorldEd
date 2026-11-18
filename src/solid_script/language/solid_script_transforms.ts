import * as THREE from 'three';
import type { SolidScriptBlockArguments } from './solid_script_block_arguments.js';
import { SOLID_SCRIPT_AXES_UP } from './solid_script_axes.js';

/** Radians per degree. */
const SOLID_SCRIPT_DEGREES = Math.PI / 180;

/**
 * Matrix of a Translate block.
 *
 * @param args Block fields.
 * @returns Matrix.
 */
export function solidScriptTranslateMatrix(args: SolidScriptBlockArguments): THREE.Matrix4 {
  const [x, y, z] = args.vector('v', [0, 0, 0]) as [number, number, number];
  return new THREE.Matrix4().makeTranslation(x, y, z);
}

/**
 * Matrix of a Rotate block: degrees around X, then Y, then Z.
 *
 * @param args Block fields.
 * @returns Matrix.
 */
export function solidScriptRotateMatrix(args: SolidScriptBlockArguments): THREE.Matrix4 {
  const [x, y, z] = args.vector('a', [0, 0, 0]).map((degrees) => degrees * SOLID_SCRIPT_DEGREES) as [
    number,
    number,
    number,
  ];
  return new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(x, y, z, 'ZYX'));
}

/**
 * Matrix of an Align To block: the shortest turn that makes up (+Y) point along
 * the direction.
 *
 * @param args Block fields.
 * @returns Matrix.
 */
export function solidScriptAlignMatrix(args: SolidScriptBlockArguments): THREE.Matrix4 {
  return solidScriptAlignDirectionMatrix(new THREE.Vector3(...args.vector('direction', [0, 1, 0])));
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
 * Matrix of a Scale block.
 *
 * @param args Block fields.
 * @returns Matrix.
 */
export function solidScriptScaleMatrix(args: SolidScriptBlockArguments): THREE.Matrix4 {
  const [x, y, z] = args.vector('v', [1, 1, 1]) as [number, number, number];
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
