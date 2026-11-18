import { solidScriptKindNamed, solidScriptKindOf } from './solid_script_kinds.js';
import {
  solidScriptValueEquals,
  solidScriptValueNumeric,
  solidScriptValueShow,
  solidScriptValueTruthy,
  type SolidScriptValue,
} from './solid_script_value.js';

/**
 * Applies a binary operator with vector semantics.
 *
 * @param operator Operator symbol.
 * @param left Left operand.
 * @param right Right operand.
 * @returns Result, or undefined for unsupported operand types.
 */
export function solidScriptArithmeticBinary(
  operator: string,
  leftGiven: SolidScriptValue,
  rightGiven: SolidScriptValue,
): SolidScriptValue {
  const left = solidScriptValueNumeric(leftGiven);
  const right = solidScriptValueNumeric(rightGiven);
  if (operator === '==') return solidScriptValueEquals(left, right);
  if (operator === '!=') return !solidScriptValueEquals(left, right);
  if (operator === '&&') return solidScriptValueTruthy(left) && solidScriptValueTruthy(right);
  if (operator === '||') return solidScriptValueTruthy(left) || solidScriptValueTruthy(right);
  if (typeof left === 'number' && typeof right === 'number') return solidScriptNumberBinary(operator, left, right);
  const nested = (value: SolidScriptValue): boolean => Array.isArray(value) && Array.isArray(value[0]);
  // A matrix times a vector or matrix multiplies rows by columns.
  if (operator === '*' && (nested(left) || nested(right))) return solidScriptMultiply(left, right);
  // A vector and a number: * and / scale every part.
  if ((operator === '*' || operator === '/') && Array.isArray(left) && typeof right === 'number')
    return left.map((entry) => solidScriptArithmeticBinary(operator, entry, right));
  if ((operator === '*' || operator === '/') && typeof left === 'number' && Array.isArray(right))
    return right.map((entry) => solidScriptArithmeticBinary(operator, left, entry));
  // Two vectors combine part by part; Dot and Cross are functions.
  if (['+', '-', '*', '/'].includes(operator) && Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length)
      throw new Error(
        `cannot use ${operator} on lists of ${left.length} and ${right.length} numbers; both sides need as many numbers`,
      );
    return left.map((entry, index) => solidScriptArithmeticBinary(operator, entry, right[index]));
  }
  if (typeof left === 'string' && typeof right === 'string') {
    const compared = solidScriptCompare(operator, left, right);
    if (compared !== undefined) return compared;
  }
  throw solidScriptArithmeticError(operator, left, right);
}

/**
 * Explains in plain words why two values cannot be combined, naming the one
 * that is not a number.
 *
 * @param operator Operator symbol.
 * @param left Left value.
 * @param right Right value.
 * @returns Error.
 */
function solidScriptArithmeticError(operator: string, left: SolidScriptValue, right: SolidScriptValue): Error {
  const odd = [left, right].find((value) => typeof value !== 'number' && !Array.isArray(value));
  if (odd !== undefined)
    return new Error(
      `${operator} needs numbers, but ${solidScriptValueShow(odd)} is ${solidScriptKindNamed(odd)}, not a number`,
    );
  return new Error(
    `cannot use ${operator} on ${solidScriptValueShow(left)} (${solidScriptKindOf(left)}) and ${solidScriptValueShow(right)} (${solidScriptKindOf(right)}); math works on numbers, and on vectors or number lists of the same length`,
  );
}

/**
 * Applies a binary operator to two numbers.
 *
 * @param operator Operator symbol.
 * @param left Left number.
 * @param right Right number.
 * @returns Result.
 */
function solidScriptNumberBinary(operator: string, left: number, right: number): SolidScriptValue {
  if (operator === '+') return left + right;
  if (operator === '-') return left - right;
  if (operator === '*') return left * right;
  if ((operator === '/' || operator === '%') && right === 0)
    throw new Error('division by zero; check that what is divided by cannot be 0');
  if (operator === '/') return left / right;
  if (operator === '%') return left % right;
  if (operator === '^') return left ** right;
  return solidScriptCompare(operator, left, right);
}

/**
 * Applies a comparison operator.
 *
 * @param operator Operator symbol.
 * @param left Left value.
 * @param right Right value.
 * @returns Comparison result, or undefined for a non-comparison operator.
 */
function solidScriptCompare(operator: string, left: number | string, right: number | string): SolidScriptValue {
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
function solidScriptMultiply(left: SolidScriptValue, right: SolidScriptValue): SolidScriptValue {
  if (typeof left === 'number' && Array.isArray(right)) return right.map((entry) => solidScriptMultiply(left, entry));
  if (Array.isArray(left) && typeof right === 'number') return left.map((entry) => solidScriptMultiply(entry, right));
  if (typeof left === 'number' && typeof right === 'number') return left * right;
  if (!Array.isArray(left) || !Array.isArray(right)) throw solidScriptArithmeticError('*', left, right);
  if (Array.isArray(left[0])) return left.map((row) => solidScriptMultiply(row, right));
  if (Array.isArray(right[0])) return solidScriptVectorMatrix(left, right);
  return left.reduce<SolidScriptValue>(
    (sum, entry, index) => solidScriptArithmeticBinary('+', sum, solidScriptMultiply(entry, right[index])),
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
function solidScriptVectorMatrix(vector: SolidScriptValue[], matrix: SolidScriptValue[]): SolidScriptValue {
  const columns = Array.isArray(matrix[0]) ? matrix[0].length : 0;
  return Array.from({ length: columns }, (_, column) =>
    solidScriptMultiply(
      vector,
      matrix.map((row) => (Array.isArray(row) ? row[column] : undefined)),
    ),
  );
}
