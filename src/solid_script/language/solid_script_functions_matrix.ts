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
export function solidScriptMatrixRead(value: SolidScriptValue, usage: string): THREE.Matrix4 {
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
export function solidScriptMatrixRows(matrix: THREE.Matrix4): number[][] {
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

/**
 * Composes two turns in X, Y, Z degrees: the second in world space, or in the
 * rotated space when Local is true.
 *
 * @param args First turn, second turn and optional Local.
 * @returns Combined turn in X, Y, Z degrees.
 */
function solidScriptMatrixRotateBy(args: readonly SolidScriptValue[]): number[] {
  const usage = 'RotateBy(rotation, by, local)';
  const rotation = solidScriptRotationDegreesMatrix(solidScriptMatrixVector(args[0], usage, 'Rotation').toArray());
  const by = solidScriptRotationDegreesMatrix(solidScriptMatrixVector(args[1], usage, 'By').toArray());
  const local = args[2] ?? false;
  if (typeof local !== 'boolean') throw new Error(`${usage} needs true or false for Local`);
  return solidScriptRotationDegrees(local ? rotation.multiply(by) : by.multiply(rotation));
}

/**
 * Applies a matrix to a point: its top three rows give the placed point and its
 * bottom row the W a projection divides by.
 *
 * @param args Matrix and point.
 * @param usage Usage for errors.
 * @returns Placed point and W.
 */
function solidScriptMatrixPoint(
  args: readonly SolidScriptValue[],
  usage: string,
): { affine: THREE.Vector3; w: number } {
  const point = new THREE.Vector4(...solidScriptMatrixVector(args[1], usage, 'a point').toArray(), 1);
  const [x = 0, y = 0, z = 0, w = 1] = solidScriptMatrixRows(solidScriptMatrixRead(args[0], usage)).map((row) =>
    new THREE.Vector4(...row).dot(point),
  );
  return { affine: new THREE.Vector3(x, y, z), w };
}

/**
 * Reads one number of a matrix by row and column, each from 0 to 3.
 *
 * @param args Matrix, row and column.
 * @returns The number.
 */
function solidScriptMatrixAt(args: readonly SolidScriptValue[]): number {
  const usage = 'MatrixAt(matrix, row, column)';
  const rows = solidScriptMatrixRows(solidScriptMatrixRead(args[0], usage));
  const [row, column] = [args[1], args[2]];
  const inside = (value: SolidScriptValue | undefined): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 3;
  if (!inside(row) || !inside(column))
    throw new Error(`${usage} needs a whole row and column from 0 to 3, such as MatrixAt(matrix, 0, 3)`);
  return rows[row]?.[column] ?? 0;
}

/** Matrix functions: build, combine, undo, read back and apply. */
export const SOLID_SCRIPT_FUNCTIONS_MATRIX = {
  rotate_by: solidScriptMatrixRotateBy,
  transform: solidScriptMatrixTransform,
  invert: solidScriptMatrixInvert,
  transform_point: (args) => solidScriptMatrixPoint(args, 'TransformPoint(matrix, point)').affine.toArray(),
  project_point: (args) => {
    const { affine, w } = solidScriptMatrixPoint(args, 'ProjectPoint(matrix, point)');
    return (w === 0 ? new THREE.Vector3() : affine.divideScalar(Math.abs(w))).toArray();
  },
  transform_direction: (args) => {
    const usage = 'TransformDirection(matrix, direction)';
    const direction = solidScriptMatrixVector(args[1], usage, 'a direction');
    return direction.applyMatrix3(new THREE.Matrix3().setFromMatrix4(solidScriptMatrixRead(args[0], usage))).toArray();
  },
  matrix_move: (args) => solidScriptMatrixParts(args[0], 'MatrixMove(matrix)')[0],
  matrix_rotate: (args) => solidScriptMatrixParts(args[0], 'MatrixRotate(matrix)')[1],
  matrix_scale: (args) => solidScriptMatrixParts(args[0], 'MatrixScale(matrix)')[2],
  matrix_multiply: (args) => {
    const usage = 'MatrixMultiply(a, b)';
    return solidScriptMatrixRows(solidScriptMatrixRead(args[0], usage).multiply(solidScriptMatrixRead(args[1], usage)));
  },
  matrix_at: solidScriptMatrixAt,
  matrix_determinant: (args) => solidScriptMatrixRead(args[0], 'MatrixDeterminant(matrix)').determinant(),
  matrix_transpose: (args) =>
    solidScriptMatrixRows(solidScriptMatrixRead(args[0], 'MatrixTranspose(matrix)').transpose()),
} satisfies Readonly<Record<string, SolidScriptMatrixFunction>>;
