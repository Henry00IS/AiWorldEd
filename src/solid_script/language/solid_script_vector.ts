import * as THREE from 'three';
import { solidScriptValueNumber, solidScriptValueNumbers, type SolidScriptValue } from './solid_script_value.js';

/** X, Y and Z of a vector. */
export type SolidScriptVector3 = [number, number, number];

/** X and Y of a flat point. */
export type SolidScriptVector2 = [number, number];

/**
 * Reads two or three numbers as X, Y and Z: a vector of two numbers lies flat,
 * so its Z is 0, and [1, 2] is the same as [1, 2, 0].
 *
 * @param numbers Numbers.
 * @returns X, Y and Z, or undefined for any other count.
 */
export function solidScriptVectorOfNumbers(numbers: readonly number[]): SolidScriptVector3 | undefined {
  if (numbers.length === 3) return [numbers[0]!, numbers[1]!, numbers[2]!];
  if (numbers.length === 2) return [numbers[0]!, numbers[1]!, 0];
  return undefined;
}

/**
 * Reads a value of two or three numbers as X, Y and Z, Z being 0 when left off.
 *
 * @param value Value.
 * @returns X, Y and Z, or undefined when the value is no vector.
 */
export function solidScriptVectorRead(value: SolidScriptValue): SolidScriptVector3 | undefined {
  const numbers = solidScriptValueNumbers(value);
  return numbers ? solidScriptVectorOfNumbers(numbers) : undefined;
}

/**
 * Reads a vector the way a size or a scale reads it: one number fills every
 * axis, and two or three numbers are X, Y and Z.
 *
 * @param value Value.
 * @returns X, Y and Z, or undefined when the value is no vector.
 */
export function solidScriptVectorReadFilled(value: SolidScriptValue): SolidScriptVector3 | undefined {
  const single = Array.isArray(value) ? undefined : solidScriptValueNumber(value);
  return single === undefined ? solidScriptVectorRead(value) : [single, single, single];
}

/**
 * Reads a vector as a flat point: X and Y of two or three numbers, Z left out.
 *
 * @param value Value.
 * @returns X and Y, or undefined when the value is no vector.
 */
export function solidScriptVectorReadFlat(value: SolidScriptValue): SolidScriptVector2 | undefined {
  const vector = solidScriptVectorRead(value);
  return vector ? [vector[0], vector[1]] : undefined;
}

/**
 * Reads a vector, stopping with a message when the value is no vector.
 *
 * @param value Value.
 * @param problem Message when it is no vector.
 * @returns X, Y and Z.
 */
export function solidScriptVectorRequire(value: SolidScriptValue, problem: string): SolidScriptVector3 {
  const vector = solidScriptVectorRead(value);
  if (!vector) throw new Error(problem);
  return vector;
}

/**
 * Reads a vector as a Three.js vector.
 *
 * @param value Value.
 * @returns Vector, or undefined when the value is no vector.
 */
export function solidScriptVectorThree(value: SolidScriptValue): THREE.Vector3 | undefined {
  const vector = solidScriptVectorRead(value);
  return vector ? new THREE.Vector3(vector[0], vector[1], vector[2]) : undefined;
}

/**
 * Reads a vector as a Three.js vector, stopping with a message when the value
 * is no vector.
 *
 * @param value Value.
 * @param problem Message when it is no vector.
 * @returns Vector.
 */
export function solidScriptVectorThreeRequire(value: SolidScriptValue, problem: string): THREE.Vector3 {
  const [x, y, z] = solidScriptVectorRequire(value, problem);
  return new THREE.Vector3(x, y, z);
}

/**
 * Tells whether a value is a flat vector, two numbers, whose Z reads as 0.
 *
 * @param value Value.
 * @returns True for two numbers.
 */
export function solidScriptVectorIsFlat(value: SolidScriptValue): boolean {
  return Array.isArray(value) && value.length === 2 && solidScriptValueNumbers(value) !== undefined;
}

/**
 * Reads a center or a size: a vector, or one number for the same size on every
 * axis when that is allowed.
 *
 * @param value Value.
 * @param uniform Whether one number may stand for every axis.
 * @returns X, Y and Z, the one number alone, or undefined.
 */
export function solidScriptVectorOrSize(value: SolidScriptValue, uniform: boolean): number[] | undefined {
  const vector = solidScriptVectorRead(value);
  if (vector) return vector;
  const size = Array.isArray(value) ? undefined : solidScriptValueNumber(value);
  return uniform && size !== undefined ? [size] : undefined;
}
