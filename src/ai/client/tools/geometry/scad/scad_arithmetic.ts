import { scadValueEquals, scadValueTruthy, type ScadValue } from './scad_value.js';

/**
 * Applies a binary operator with OpenSCAD vector semantics.
 *
 * @param operator Operator symbol.
 * @param left Left operand.
 * @param right Right operand.
 * @returns Result, or undefined for unsupported operand types.
 */
export function scadArithmeticBinary(operator: string, left: ScadValue, right: ScadValue): ScadValue {
  if (operator === '==') return scadValueEquals(left, right);
  if (operator === '!=') return !scadValueEquals(left, right);
  if (operator === '&&') return scadValueTruthy(left) && scadValueTruthy(right);
  if (operator === '||') return scadValueTruthy(left) || scadValueTruthy(right);
  if (typeof left === 'number' && typeof right === 'number') return scadNumberBinary(operator, left, right);
  if (operator === '*') return scadMultiply(left, right);
  if (operator === '/' && Array.isArray(left) && typeof right === 'number') {
    return left.map((entry) => scadArithmeticBinary('/', entry, right));
  }
  if ((operator === '+' || operator === '-') && Array.isArray(left) && Array.isArray(right)) {
    const length = Math.min(left.length, right.length);
    return Array.from({ length }, (_, index) => scadArithmeticBinary(operator, left[index], right[index]));
  }
  if (typeof left === 'string' && typeof right === 'string') return scadCompare(operator, left, right);
  return undefined;
}

/**
 * Applies a binary operator to two numbers.
 *
 * @param operator Operator symbol.
 * @param left Left number.
 * @param right Right number.
 * @returns Result.
 */
function scadNumberBinary(operator: string, left: number, right: number): ScadValue {
  if (operator === '+') return left + right;
  if (operator === '-') return left - right;
  if (operator === '*') return left * right;
  if (operator === '/') return left / right;
  if (operator === '%') return left % right;
  return scadCompare(operator, left, right);
}

/**
 * Applies a comparison operator.
 *
 * @param operator Operator symbol.
 * @param left Left value.
 * @param right Right value.
 * @returns Comparison result, or undefined for a non-comparison operator.
 */
function scadCompare(operator: string, left: number | string, right: number | string): ScadValue {
  if (operator === '<') return left < right;
  if (operator === '<=') return left <= right;
  if (operator === '>') return left > right;
  if (operator === '>=') return left >= right;
  return undefined;
}

/**
 * Multiplies scalars, vectors and matrices.
 *
 * @param left Left operand.
 * @param right Right operand.
 * @returns Scaled vector, dot product, or matrix product.
 */
function scadMultiply(left: ScadValue, right: ScadValue): ScadValue {
  if (typeof left === 'number' && Array.isArray(right)) return right.map((entry) => scadMultiply(left, entry));
  if (Array.isArray(left) && typeof right === 'number') return left.map((entry) => scadMultiply(entry, right));
  if (typeof left === 'number' && typeof right === 'number') return left * right;
  if (!Array.isArray(left) || !Array.isArray(right)) return undefined;
  if (Array.isArray(left[0])) return left.map((row) => scadMultiply(row, right));
  if (Array.isArray(right[0])) return scadVectorMatrix(left, right);
  return left.reduce<ScadValue>(
    (sum, entry, index) => scadArithmeticBinary('+', sum, scadMultiply(entry, right[index])),
    0,
  );
}

/**
 * Multiplies a row vector by a matrix.
 *
 * @param vector Row vector.
 * @param matrix Matrix rows.
 * @returns Product vector.
 */
function scadVectorMatrix(vector: ScadValue[], matrix: ScadValue[]): ScadValue {
  const columns = Array.isArray(matrix[0]) ? matrix[0].length : 0;
  return Array.from({ length: columns }, (_, column) =>
    scadMultiply(
      vector,
      matrix.map((row) => (Array.isArray(row) ? row[column] : undefined)),
    ),
  );
}
