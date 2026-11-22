import * as THREE from 'three';
import { solidScriptExtraNumber, solidScriptExtraVector } from './solid_script_functions_extra.js';
import type { SolidScriptValue } from './solid_script_value.js';

/** A built-in function over evaluated arguments. */
type SolidScriptCoordinatesBuiltin = (args: SolidScriptValue[]) => SolidScriptValue;

/**
 * Reads an argument as a vector of three numbers.
 *
 * @param args Arguments.
 * @param usage How to call the function, for the message.
 * @returns X, Y and Z.
 */
function solidScriptCoordinatesVector(args: readonly SolidScriptValue[], usage: string): [number, number, number] {
  const [x, y, z] = solidScriptExtraVector(args, 0, usage);
  if (x === undefined || y === undefined || z === undefined)
    throw new Error(`${usage} needs a vector of three numbers`);
  return [x, y, z];
}

/**
 * Turns a vector around so it points the same way as a reference, keeping it
 * when it already does.
 *
 * @param args Vector and reference.
 * @returns The vector, or it reversed.
 */
function solidScriptCoordinatesFlipToward(args: readonly SolidScriptValue[]): number[] {
  const usage = 'FlipToward(vector, reference)';
  const vector = solidScriptExtraVector(args, 0, usage);
  const reference = solidScriptExtraVector(args, 1, usage);
  if (vector.length !== reference.length) throw new Error(`${usage} needs two vectors of the same size`);
  const facing = vector.reduce((total, value, axis) => total + value * (reference[axis] ?? 0), 0);
  return facing < 0 ? vector.map((value) => -value) : vector;
}

/**
 * Builds a point from cylinder coordinates around the Y axis: 0 degrees points
 * along X and 90 along Z.
 *
 * @param args Radius, degrees and height.
 * @returns Point.
 */
function solidScriptCoordinatesFromCylinder(args: readonly SolidScriptValue[]): number[] {
  const usage = 'FromCylinder(radius, degrees, height)';
  const radius = solidScriptExtraNumber(args, 0, usage);
  const radians = THREE.MathUtils.degToRad(solidScriptExtraNumber(args, 1, usage));
  return [radius * Math.cos(radians), solidScriptExtraNumber(args, 2, usage), radius * Math.sin(radians)];
}

/**
 * Builds a point from sphere coordinates: yaw turns around the Y axis from X
 * toward Z, pitch lifts from flat toward Y.
 *
 * @param args Radius, yaw and pitch in degrees.
 * @returns Point.
 */
function solidScriptCoordinatesFromSphere(args: readonly SolidScriptValue[]): number[] {
  const usage = 'FromSphere(radius, yaw, pitch)';
  const radius = solidScriptExtraNumber(args, 0, usage);
  const yaw = THREE.MathUtils.degToRad(solidScriptExtraNumber(args, 1, usage));
  const pitch = THREE.MathUtils.degToRad(solidScriptExtraNumber(args, 2, usage));
  const flat = radius * Math.cos(pitch);
  return [flat * Math.cos(yaw), radius * Math.sin(pitch), flat * Math.sin(yaw)];
}

/**
 * Reads a point as cylinder coordinates around the Y axis.
 *
 * @param args The point.
 * @returns Radius, degrees and height.
 */
function solidScriptCoordinatesToCylinder(args: readonly SolidScriptValue[]): number[] {
  const [x, y, z] = solidScriptCoordinatesVector(args, 'ToCylinder(vector)');
  return [Math.hypot(x, z), THREE.MathUtils.radToDeg(Math.atan2(z, x)), y];
}

/**
 * Reads a point as sphere coordinates.
 *
 * @param args The point.
 * @returns Radius, yaw and pitch in degrees.
 */
function solidScriptCoordinatesToSphere(args: readonly SolidScriptValue[]): number[] {
  const [x, y, z] = solidScriptCoordinatesVector(args, 'ToSphere(vector)');
  const radius = Math.hypot(x, y, z);
  const pitch = radius === 0 ? 0 : Math.asin(y / radius);
  return [radius, THREE.MathUtils.radToDeg(Math.atan2(z, x)), THREE.MathUtils.radToDeg(pitch)];
}

/**
 * Coordinate helpers: flipping a vector toward a reference, and cylinder and
 * sphere coordinates.
 */
export const SOLID_SCRIPT_FUNCTIONS_COORDINATES = {
  flip_toward: solidScriptCoordinatesFlipToward,
  from_cylinder: solidScriptCoordinatesFromCylinder,
  from_sphere: solidScriptCoordinatesFromSphere,
  to_cylinder: solidScriptCoordinatesToCylinder,
  to_sphere: solidScriptCoordinatesToSphere,
} satisfies Readonly<Record<string, SolidScriptCoordinatesBuiltin>>;
