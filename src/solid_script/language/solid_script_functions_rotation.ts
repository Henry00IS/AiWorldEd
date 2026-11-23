import * as THREE from 'three';
import { solidScriptExtraNumber } from './solid_script_functions_extra.js';
import { solidScriptMemberRound } from './solid_script_members.js';
import { solidScriptRotationDegrees, solidScriptRotationDegreesMatrix } from './solid_script_transforms.js';
import {
  SolidScriptRotation,
  solidScriptValueNumbers,
  solidScriptValueText,
  type SolidScriptValue,
} from './solid_script_value.js';

/**
 * Reads a Rotation, or a turn in X, Y, Z degrees, as a quaternion.
 *
 * @param value Argument.
 * @param usage How to call the function, for the message.
 * @returns The turn.
 */
function solidScriptRotationRead(value: SolidScriptValue, usage: string): THREE.Quaternion {
  if (value instanceof SolidScriptRotation) return new THREE.Quaternion(...value.quaternion);
  const numbers = solidScriptValueNumbers(value);
  if (numbers?.length !== 3)
    throw new Error(
      `${usage} needs a Rotation or a turn as three numbers, such as Rotation(0, 90, 0) or Vector(0, 90, 0), not ${solidScriptValueText(value)}`,
    );
  return new THREE.Quaternion().setFromRotationMatrix(solidScriptRotationDegreesMatrix(numbers));
}

/**
 * Writes a quaternion as X, Y, Z degrees in the order Rotate uses, without
 * rounding noise.
 *
 * @param turn The turn.
 * @returns Degrees.
 */
function solidScriptRotationWrite(turn: THREE.Quaternion): number[] {
  return solidScriptRotationDegrees(new THREE.Matrix4().makeRotationFromQuaternion(turn)).map(solidScriptMemberRound);
}

/**
 * Makes a Rotation value from a quaternion.
 *
 * @param turn The turn.
 * @returns Rotation.
 */
function solidScriptRotationOf(turn: THREE.Quaternion): SolidScriptRotation {
  const unit = turn.clone().normalize();
  return new SolidScriptRotation(unit.toArray(), solidScriptRotationWrite(unit));
}

/**
 * Gives a turn back in the kind of the value it came from: a Rotation for a
 * Rotation, else X, Y, Z degrees.
 *
 * @param turn The turn.
 * @param like Value it was worked out from.
 * @returns Rotation or degrees.
 */
function solidScriptRotationLike(turn: THREE.Quaternion, like: SolidScriptValue): SolidScriptValue {
  return like instanceof SolidScriptRotation ? solidScriptRotationOf(turn) : solidScriptRotationWrite(turn);
}

/**
 * Makes a Rotation around an axis by an angle in degrees, turning the way the
 * right-hand rule says.
 *
 * @param args Axis, then angle.
 * @returns Rotation.
 */
function solidScriptRotationAround(args: SolidScriptValue[]): SolidScriptRotation {
  const usage = 'RotationAround(axis, angle)';
  const axis = solidScriptValueNumbers(args[0]);
  if (axis?.length !== 3 || Math.hypot(...axis) === 0)
    throw new Error(`${usage} needs an axis as three numbers that are not all 0, such as Vector(0, 1, 0)`);
  const angle = THREE.MathUtils.degToRad(solidScriptExtraNumber(args, 1, usage));
  const unit = new THREE.Vector3(...axis).normalize();
  return solidScriptRotationOf(new THREE.Quaternion().setFromAxisAngle(unit, angle));
}

/**
 * Turns a point or direction by a Rotation or by X, Y, Z degrees.
 *
 * @param args Vector, then the turn.
 * @returns Turned vector.
 */
function solidScriptRotationApply(args: SolidScriptValue[]): number[] {
  const usage = 'ApplyRotation(vector, rotation)';
  const vector = solidScriptValueNumbers(args[0]);
  if (vector?.length !== 3) throw new Error(`${usage} needs a vector as three numbers, such as Vector(1, 0, 0)`);
  const turned = new THREE.Vector3(...vector).applyQuaternion(solidScriptRotationRead(args[1], usage));
  return turned.toArray().map(solidScriptMemberRound);
}

/**
 * Reads the axis and the angle in degrees of a turn, with an angle from 0 to
 * 180.
 *
 * @param value Turn in X, Y, Z degrees.
 * @param usage How to call the function, for the message.
 * @returns Axis, X when there is no turn, and angle.
 */
function solidScriptRotationAxisAngle(value: SolidScriptValue, usage: string): [number[], number] {
  const turn = solidScriptRotationRead(value, usage);
  if (turn.w < 0) turn.set(-turn.x, -turn.y, -turn.z, -turn.w);
  const axis = new THREE.Vector3(turn.x, turn.y, turn.z);
  if (axis.lengthSq() < 1e-18) return [[1, 0, 0], 0];
  return [
    axis.normalize().toArray().map(solidScriptMemberRound),
    solidScriptMemberRound(THREE.MathUtils.radToDeg(2 * Math.acos(Math.min(1, turn.w)))),
  ];
}

/** Rotation functions over Rotations and turns in X, Y, Z degrees. */
export const SOLID_SCRIPT_FUNCTIONS_ROTATION = {
  rotation: (args: SolidScriptValue[]) =>
    solidScriptRotationOf(solidScriptRotationRead(args.slice(0, 3), 'Rotation(x, y, z)')),
  rotation_around: solidScriptRotationAround,
  combine_rotations: (args: SolidScriptValue[]) => {
    const usage = 'CombineRotations(first, then)';
    const first = solidScriptRotationRead(args[0], usage);
    return solidScriptRotationOf(solidScriptRotationRead(args[1], usage).multiply(first));
  },
  rotation_degrees: (args: SolidScriptValue[]) =>
    solidScriptRotationWrite(solidScriptRotationRead(args[0], 'RotationDegrees(rotation)')),
  apply_rotation: solidScriptRotationApply,
  invert_rotation: (args: SolidScriptValue[]) =>
    solidScriptRotationLike(solidScriptRotationRead(args[0], 'InvertRotation(rotation)').invert(), args[0]),
  rotation_axis: (args: SolidScriptValue[]) => solidScriptRotationAxisAngle(args[0], 'RotationAxis(rotation)')[0],
  rotation_angle: (args: SolidScriptValue[]) => solidScriptRotationAxisAngle(args[0], 'RotationAngle(rotation)')[1],
  mix_rotation: (args: SolidScriptValue[]) => {
    const usage = 'MixRotation(a, b, factor)';
    const from = solidScriptRotationRead(args[0], usage);
    const factor = solidScriptExtraNumber(args, 2, usage);
    return solidScriptRotationLike(from.slerp(solidScriptRotationRead(args[1], usage), factor), args[0]);
  },
};
