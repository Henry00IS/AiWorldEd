import type { SolidScriptValue } from './solid_script_value.js';

/**
 * Keeps a number a script works with ordinary: not a number, such as Sqrt(-1),
 * becomes 0, and a number too large to hold becomes the largest number there
 * is, or its negative, so no value is ever NaN or Infinity.
 *
 * @param value Number.
 * @returns Ordinary number.
 */
export function solidScriptNumberSafe(value: number): number {
  if (value - value === 0) return value;
  if (value > 0) return Number.MAX_VALUE;
  return value < 0 ? -Number.MAX_VALUE : 0;
}

/**
 * Keeps every number of a value ordinary, the items of lists included; a value
 * with nothing to change is given back as it is.
 *
 * @param value Value.
 * @returns Value without NaN or Infinity.
 */
export function solidScriptValueSafe(value: SolidScriptValue): SolidScriptValue {
  if (typeof value === 'number') return value - value === 0 ? value : solidScriptNumberSafe(value);
  return Array.isArray(value) ? solidScriptListSafe(value) : value;
}

/**
 * Keeps a value ordinary when it is a number; a list is left as it is, as every
 * list a formula makes is kept ordinary where it is made.
 *
 * @param value Value.
 * @returns Value, an ordinary number when it is a number.
 */
export function solidScriptValueSafeTop(value: SolidScriptValue): SolidScriptValue {
  return typeof value === 'number' && value - value !== 0 ? solidScriptNumberSafe(value) : value;
}

/**
 * Keeps the numbers of values ordinary in place, without looking inside lists.
 *
 * @param values Values, changed in place.
 */
export function solidScriptValuesSafeTop(values: SolidScriptValue[]): void {
  for (let index = 0; index < values.length; index++) values[index] = solidScriptValueSafeTop(values[index]);
}

/**
 * Keeps every number of a list ordinary, copying the list only when one
 * changes.
 *
 * @param list List.
 * @returns List without NaN or Infinity.
 */
function solidScriptListSafe(list: SolidScriptValue[]): SolidScriptValue[] {
  let safe: SolidScriptValue[] | null = null;
  for (let index = 0; index < list.length; index++) {
    const item = list[index];
    if (typeof item === 'number' ? item - item === 0 : !Array.isArray(item)) continue;
    const fixed = solidScriptValueSafe(item);
    if (fixed === item) continue;
    safe ??= list.slice();
    safe[index] = fixed;
  }
  return safe ?? list;
}

/** Number text that spells Infinity itself, which stays text. */
const SOLID_SCRIPT_NUMBER_INFINITY = /^[-+]?Infinity$/;

/**
 * Reads text that spells a number, such as 2, -0.5 or 1e400, which is too large
 * to hold and reads as the largest number there is.
 *
 * @param text Text, trimmed.
 * @returns Number, or undefined when the text is no number.
 */
export function solidScriptNumberRead(text: string): number | undefined {
  if (text === '') return undefined;
  const number = Number(text);
  if (number - number === 0) return number;
  if (Number.isNaN(number) || SOLID_SCRIPT_NUMBER_INFINITY.test(text)) return undefined;
  return solidScriptNumberSafe(number);
}
