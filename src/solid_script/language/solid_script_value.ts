/** Runtime value of the solid script language. */
export type SolidScriptValue = number | string | boolean | undefined | SolidScriptValue[];

/** Most list entries a range or comprehension may produce. */
export const SOLID_SCRIPT_LIST_LIMIT = 10000;

/**
 * Returns truthiness of a value.
 *
 * @param value Value.
 * @returns True unless false, zero, empty, or undef.
 */
export function solidScriptValueTruthy(value: SolidScriptValue): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.length > 0;
  return Boolean(value);
}

/**
 * Returns the value as a finite number, or undefined. Text that spells a
 * number, such as "3", counts as that number: a value is plain text
 * underneath and only becomes a number where one is needed.
 *
 * @param value Value.
 * @returns Number or undefined.
 */
export function solidScriptValueNumber(value: SolidScriptValue): number | undefined {
  if (typeof value === 'string') {
    const text = value.trim();
    const number = text === '' ? NaN : Number(text);
    return Number.isFinite(number) ? number : undefined;
  }
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Returns text that spells a number as that number and leaves every other value
 * as it is.
 *
 * @param value Value.
 * @returns Number or the value.
 */
export function solidScriptValueNumeric(value: SolidScriptValue): SolidScriptValue {
  return typeof value === 'string' ? (solidScriptValueNumber(value) ?? value) : value;
}

/**
 * Names the kind of a value in plain words for the variable explorer, help and
 * error messages: Number, Whole Number, Text, Yes/No, Vector, List of Numbers,
 * List of Text, List, or Nothing.
 *
 * @param value Value.
 * @returns Friendly type.
 */
export function solidScriptValueType(value: SolidScriptValue): string {
  if (value === undefined) return 'Nothing';
  if (typeof value === 'boolean') return 'Yes/No';
  if (Array.isArray(value)) {
    if (value.length === 0) return 'List';
    const kinds = new Set(value.map((entry) => solidScriptValueType(entry)));
    const numbers = [...kinds].every((kind) => kind === 'Number' || kind === 'Whole Number');
    if (numbers && (value.length === 2 || value.length === 3)) return 'Vector';
    if (numbers) return 'List of Numbers';
    if (kinds.size === 1 && kinds.has('Text')) return 'List of Text';
    if (kinds.size === 1 && kinds.has('Vector')) return 'List of Vectors';
    return 'List';
  }
  const number = solidScriptValueNumber(value);
  if (number === undefined) return 'Text';
  return Number.isInteger(number) ? 'Whole Number' : 'Number';
}

/**
 * Returns the value as a list of numbers, or undefined when any entry is not a
 * number.
 *
 * @param value Value.
 * @returns Numbers or undefined.
 */
export function solidScriptValueNumbers(value: SolidScriptValue): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const numbers = value.map(solidScriptValueNumber);
  return numbers.every((entry): entry is number => entry !== undefined) ? numbers : undefined;
}

/**
 * Compares two values structurally.
 *
 * @param left First value.
 * @param right Second value.
 * @returns True when equal.
 */
export function solidScriptValueEquals(left: SolidScriptValue, right: SolidScriptValue): boolean {
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((entry, index) => solidScriptValueEquals(entry, right[index]));
  }
  return solidScriptValueNumeric(left) === solidScriptValueNumeric(right);
}

/**
 * Formats a value the way str() does.
 *
 * @param value Value.
 * @returns Text.
 */
export function solidScriptValueText(value: SolidScriptValue): string {
  if (value === undefined) return 'undef';
  if (Array.isArray(value)) return `[${value.map(solidScriptValueText).join(', ')}]`;
  return String(value);
}

/**
 * Formats a value for error messages: text in quotes, everything else as str()
 * writes it.
 *
 * @param value Value.
 * @returns Text.
 */
export function solidScriptValueShow(value: SolidScriptValue): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(solidScriptValueShow).join(', ')}]`;
  return solidScriptValueText(value);
}
