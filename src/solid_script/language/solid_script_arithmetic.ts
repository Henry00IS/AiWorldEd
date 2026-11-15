import { solidScriptValueEquals, solidScriptValueTruthy, type SolidScriptValue } from './solid_script_value.js';

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
  left: SolidScriptValue,
  right: SolidScriptValue,
): SolidScriptValue {
  if (operator === '==') return solidScriptValueEquals(left, right);
  if (operator === '!=') return !solidScriptValueEquals(left, right);
  if (operator === '&&') return solidScriptValueTruthy(left) && solidScriptValueTruthy(right);
  if (operator === '||') return solidScriptValueTruthy(left) || solidScriptValueTruthy(right);
  if (typeof left === 'number' && typeof right === 'number') return solidScriptNumberBinary(operator, left, right);
  if (operator === '*') return solidScriptMultiply(left, right);
  if (operator === '/' && Array.isArray(left) && typeof right === 'number') {
    return left.map((entry) => solidScriptArithmeticBinary('/', entry, right));
  }
  if ((operator === '+' || operator === '-') && Array.isArray(left) && Array.isArray(right)) {
    const length = Math.min(left.length, right.length);
    return Array.from({ length }, (_, index) => solidScriptArithmeticBinary(operator, left[index], right[index]));
  }
  if (typeof left === 'string' && typeof right === 'string') return solidScriptCompare(operator, left, right);
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
function solidScriptNumberBinary(operator: string, left: number, right: number): SolidScriptValue {
  if (operator === '+') return left + right;
  if (operator === '-') return left - right;
  if (operator === '*') return left * right;
  if (operator === '/') return left / right;
  if (operator === '%') return left % right;
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
  if (!Array.isArray(left) || !Array.isArray(right)) return undefined;
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
