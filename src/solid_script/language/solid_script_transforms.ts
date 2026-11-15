import * as THREE from 'three';
import type { SolidScriptCallArguments } from './solid_script_call_arguments.js';
import { solidScriptValueNumber, solidScriptValueNumbers } from './solid_script_value.js';

/** Degrees to radians. */
const SOLID_SCRIPT_DEGREES = Math.PI / 180;

/**
 * Builds rotate(a) / rotate(a, v): Euler degrees applied X, then Y, then Z, or
 * an angle about an axis (Z when no axis is given).
 *
 * @param args Call arguments.
 * @returns Matrix.
 */
function solidScriptRotateMatrix(args: SolidScriptCallArguments): THREE.Matrix4 {
  const angle = solidScriptValueNumber(args.value('a', 0));
  if (angle !== undefined) {
    const [x, y, z] = args.vector('v', 1, [0, 0, 1]) as [number, number, number];
    const axis = new THREE.Vector3(x, y, z);
    if (axis.lengthSq() < 1e-12) return new THREE.Matrix4();
    return new THREE.Matrix4().makeRotationAxis(axis.normalize(), angle * SOLID_SCRIPT_DEGREES);
  }
  const [x, y, z] = args.vector('a', 0, [0, 0, 0]).map((degrees) => degrees * SOLID_SCRIPT_DEGREES) as [
    number,
    number,
    number,
  ];
  return new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(x, y, z, 'ZYX'));
}

/**
 * Builds mirror(v): reflection across the plane through the origin with normal
 * v.
 *
 * @param args Call arguments.
 * @returns Matrix.
 */
function solidScriptMirrorMatrix(args: SolidScriptCallArguments): THREE.Matrix4 {
  const [x, y, z] = args.vector('v', 0, [1, 0, 0]) as [number, number, number];
  const normal = new THREE.Vector3(x, y, z);
  if (normal.lengthSq() < 1e-12) return new THREE.Matrix4();
  const n = normal.normalize().toArray();
  const columns = [0, 1, 2].flatMap((column) => [
    ...[0, 1, 2].map((row) => (row === column ? 1 : 0) - 2 * (n[row] ?? 0) * (n[column] ?? 0)),
    0,
  ]);
  return new THREE.Matrix4().fromArray([...columns, 0, 0, 0, 1]);
}

/**
 * Builds multmatrix(m) from 3 or 4 rows of 4 numbers.
 *
 * @param args Call arguments.
 * @returns Matrix.
 */
function solidScriptMultmatrixMatrix(args: SolidScriptCallArguments): THREE.Matrix4 {
  const rows = args.value('m', 0);
  const cells = Array.isArray(rows) ? rows.map((row) => solidScriptValueNumbers(row)) : [];
  if (cells.length < 3 || cells.some((row) => !row || row.length < 4))
    throw new Error('multmatrix(): m must be 3 or 4 rows of 4 numbers');
  const flat = [0, 1, 2, 3].flatMap((row) => cells[row] ?? [0, 0, 0, 1]);
  return new THREE.Matrix4().set(...(flat as Parameters<THREE.Matrix4['set']>));
}

/** Transform modules and their matrix builders. */
const SOLID_SCRIPT_TRANSFORMS: Readonly<Record<string, (args: SolidScriptCallArguments) => THREE.Matrix4>> = {
  translate: (args) => {
    const [x, y, z] = args.vector('v', 0, [0, 0, 0]) as [number, number, number];
    return new THREE.Matrix4().makeTranslation(x, y, z);
  },
  rotate: solidScriptRotateMatrix,
  scale: (args) => {
    const [x, y, z] = args.vector('v', 0, [1, 1, 1]) as [number, number, number];
    return new THREE.Matrix4().makeScale(x, y, z);
  },
  mirror: solidScriptMirrorMatrix,
  multmatrix: solidScriptMultmatrixMatrix,
};

/**
 * Returns the matrix of a transform module call.
 *
 * @param name Module name.
 * @param args Call arguments.
 * @returns Matrix, or null when the module is not a transform.
 */
export function solidScriptTransformMatrix(name: string, args: SolidScriptCallArguments): THREE.Matrix4 | null {
  const build = SOLID_SCRIPT_TRANSFORMS[name];
  return build ? build(args) : null;
}
