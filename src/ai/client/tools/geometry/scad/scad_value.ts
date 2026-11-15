/** Runtime value of the supported OpenSCAD subset. */
export type ScadValue = number | string | boolean | undefined | ScadValue[];

/** Most list entries a range or comprehension may produce. */
export const SCAD_LIST_LIMIT = 10000;

/**
 * Returns OpenSCAD truthiness of a value.
 *
 * @param value Value.
 * @returns True unless false, zero, empty, or undef.
 */
export function scadValueTruthy(value: ScadValue): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.length > 0;
  return Boolean(value);
}

/**
 * Returns the value as a finite number, or undefined.
 *
 * @param value Value.
 * @returns Number or undefined.
 */
export function scadValueNumber(value: ScadValue): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Returns the value as a list of numbers, or undefined when any entry is not a
 * number.
 *
 * @param value Value.
 * @returns Numbers or undefined.
 */
export function scadValueNumbers(value: ScadValue): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const numbers = value.map(scadValueNumber);
  return numbers.every((entry): entry is number => entry !== undefined) ? numbers : undefined;
}

/**
 * Compares two values structurally.
 *
 * @param left First value.
 * @param right Second value.
 * @returns True when equal.
 */
export function scadValueEquals(left: ScadValue, right: ScadValue): boolean {
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((entry, index) => scadValueEquals(entry, right[index]));
  }
  return left === right;
}

/**
 * Formats a value the way OpenSCAD str() does.
 *
 * @param value Value.
 * @returns Text.
 */
export function scadValueText(value: ScadValue): string {
  if (value === undefined) return 'undef';
  if (Array.isArray(value)) return `[${value.map(scadValueText).join(', ')}]`;
  return String(value);
}
