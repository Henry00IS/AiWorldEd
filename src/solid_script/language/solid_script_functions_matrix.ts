import * as THREE from 'three';
import { solidScriptRotationDegrees, solidScriptRotationDegreesMatrix } from './solid_script_transforms.js';
import { solidScriptValueNumbers, solidScriptValueText, type SolidScriptValue } from './solid_script_value.js';

/** A built-in function over evaluated arguments. */
type SolidScriptMatrixFunction = (args: SolidScriptValue[]) => SolidScriptValue;

/**
 * Reads a vector of three numbers.
 *
 * @param value Argument.
 * @param usage How to call the function, for the message.
 * @param what What the vector is, for the message.
 * @returns The vector.
 */
function solidScriptMatrixVector(value: SolidScriptValue, usage: string, what: string): THREE.Vector3 {
  const numbers = solidScriptValueNumbers(value);
  if (numbers?.length !== 3) throw new Error(`${usage} needs ${what} as three numbers, such as 0, 1, 0`);
  return new THREE.Vector3(numbers[0], numbers[1], numbers[2]);
}

/**
 * Reads a matrix written as four rows of four numbers.
 *
 * @param value Argument.
 * @param usage How to call the function, for the message.
 * @returns The matrix.
 */
function solidScriptMatrixRead(value: SolidScriptValue, usage: string): THREE.Matrix4 {
  const rows = Array.isArray(value) ? value.map((row) => solidScriptValueNumbers(row)) : [];
  const numbers = rows.flatMap((row) => (row?.length === 4 ? row : []));
  if (rows.length !== 4 || numbers.length !== 16)
    throw new Error(
      `${usage} needs a matrix of four rows of four numbers, not ${solidScriptValueText(value)}; try Transform(move, rotate, scale)`,
    );
  return new THREE.Matrix4().set(...(numbers as Parameters<THREE.Matrix4['set']>));
}

/**
 * Writes a matrix as four rows of four numbers.
 *
 * @param matrix Matrix.
 * @returns Rows.
 */
function solidScriptMatrixRows(matrix: THREE.Matrix4): number[][] {
  const columns = matrix.elements;
  return [0, 1, 2, 3].map((row) => [0, 1, 2, 3].map((column) => columns[column * 4 + row] ?? 0));
}

/**
 * Builds a matrix that scales, then turns X, Y and Z like Rotate, then moves.
 *
 * @param args Move, Rotate in degrees and Scale.
 * @returns Rows.
 */
function solidScriptMatrixTransform(args: readonly SolidScriptValue[]): number[][] {
  const usage = 'Transform(move, rotate, scale)';
  const move = solidScriptMatrixVector(args[0] ?? [0, 0, 0], usage, 'Move');
  const rotate = solidScriptMatrixVector(args[1] ?? [0, 0, 0], usage, 'Rotate');
  const scale = solidScriptMatrixVector(args[2] ?? [1, 1, 1], usage, 'Scale');
  const matrix = new THREE.Matrix4()
    .makeTranslation(move.x, move.y, move.z)
    .multiply(solidScriptRotationDegreesMatrix(rotate.toArray()))
    .multiply(new THREE.Matrix4().makeScale(scale.x, scale.y, scale.z));
  return solidScriptMatrixRows(matrix);
}

/**
 * Splits a matrix into its move, its turn as X, Y and Z degrees, and its scale.
 *
 * @param value Matrix.
 * @param usage How to call the function, for the message.
 * @returns The parts.
 */
function solidScriptMatrixParts(value: SolidScriptValue, usage: string): [number[], number[], number[]] {
  const matrix = solidScriptMatrixRead(value, usage);
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  matrix.decompose(position, new THREE.Quaternion(), scale);
  return [position.toArray(), solidScriptRotationDegrees(matrix), scale.toArray()];
}

/**
 * Undoes a matrix.
 *
 * @param args The matrix.
 * @returns Rows of the inverse.
 */
function solidScriptMatrixInvert(args: readonly SolidScriptValue[]): number[][] {
  const usage = 'Invert(matrix)';
  const matrix = solidScriptMatrixRead(args[0], usage);
  if (Math.abs(matrix.determinant()) < 1e-12)
    throw new Error(`${usage} cannot undo a matrix that flattens space; try a Scale without 0`);
  return solidScriptMatrixRows(matrix.invert());
}

/** Matrix functions: build, undo, read back and apply. */
export const SOLID_SCRIPT_FUNCTIONS_MATRIX = {
  transform: solidScriptMatrixTransform,
  invert: solidScriptMatrixInvert,
  transform_point: (args) => {
    const usage = 'TransformPoint(matrix, point)';
    const point = solidScriptMatrixVector(args[1], usage, 'a point');
    return point.applyMatrix4(solidScriptMatrixRead(args[0], usage)).toArray();
  },
  transform_direction: (args) => {
    const usage = 'TransformDirection(matrix, direction)';
    const direction = solidScriptMatrixVector(args[1], usage, 'a direction');
    return direction.applyMatrix3(new THREE.Matrix3().setFromMatrix4(solidScriptMatrixRead(args[0], usage))).toArray();
  },
  matrix_move: (args) => solidScriptMatrixParts(args[0], 'MatrixMove(matrix)')[0],
  matrix_rotate: (args) => solidScriptMatrixParts(args[0], 'MatrixRotate(matrix)')[1],
  matrix_scale: (args) => solidScriptMatrixParts(args[0], 'MatrixScale(matrix)')[2],
} satisfies Readonly<Record<string, SolidScriptMatrixFunction>>;
