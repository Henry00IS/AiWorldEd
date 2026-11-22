import * as THREE from 'three';
import { solidScriptExtraNumber } from './solid_script_functions_extra.js';
import { solidScriptMemberRound } from './solid_script_members.js';
import { solidScriptRotationDegrees, solidScriptRotationDegreesMatrix } from './solid_script_transforms.js';
import { solidScriptValueNumbers, solidScriptValueText, type SolidScriptValue } from './solid_script_value.js';

/**
 * Reads a turn in X, Y, Z degrees as a quaternion.
 *
 * @param value Argument.
 * @param usage How to call the function, for the message.
 * @returns The turn.
 */
function solidScriptRotationRead(value: SolidScriptValue, usage: string): THREE.Quaternion {
  const numbers = solidScriptValueNumbers(value);
  if (numbers?.length !== 3)
    throw new Error(
      `${usage} needs a turn as three numbers, such as Vector(0, 90, 0), not ${solidScriptValueText(value)}`,
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

/** Rotation functions over turns in X, Y, Z degrees. */
export const SOLID_SCRIPT_FUNCTIONS_ROTATION = {
  invert_rotation: (args: SolidScriptValue[]) =>
    solidScriptRotationWrite(solidScriptRotationRead(args[0], 'InvertRotation(rotation)').invert()),
  rotation_axis: (args: SolidScriptValue[]) => solidScriptRotationAxisAngle(args[0], 'RotationAxis(rotation)')[0],
  rotation_angle: (args: SolidScriptValue[]) => solidScriptRotationAxisAngle(args[0], 'RotationAngle(rotation)')[1],
  mix_rotation: (args: SolidScriptValue[]) => {
    const usage = 'MixRotation(a, b, factor)';
    const from = solidScriptRotationRead(args[0], usage);
    const factor = solidScriptExtraNumber(args, 2, usage);
    return solidScriptRotationWrite(from.slerp(solidScriptRotationRead(args[1], usage), factor));
  },
};
