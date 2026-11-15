import {
  solidScriptValueNumber,
  solidScriptValueNumbers,
  solidScriptValueShow,
  type SolidScriptValue,
} from './solid_script_value.js';

/**
 * The evaluated fields of one block line, read strictly: a value that does not
 * fit stops the script with a message naming the field as the block shows it.
 */
export class SolidScriptBlockArguments {
  /**
   * Creates the view.
   *
   * @param values Evaluated value per field key.
   * @param labels Visible caption per field key, for messages.
   */
  constructor(
    private readonly values: ReadonlyMap<string, SolidScriptValue>,
    private readonly labels: ReadonlyMap<string, string> = new Map(),
  ) {}

  /**
   * Returns a field value as evaluated.
   *
   * @param key Field key.
   * @returns Value, or undefined when the block has no such field.
   */
  value(key: string): SolidScriptValue {
    return this.values.get(key);
  }

  /**
   * Reads a finite number.
   *
   * @param key Field key.
   * @param fallback Value when the field is missing.
   * @returns Number.
   */
  number(key: string, fallback: number): number {
    const value = this.value(key);
    if (value === undefined) return fallback;
    const number = solidScriptValueNumber(value);
    if (number === undefined) throw this.error(key, 'must be a number', value);
    return number;
  }

  /**
   * Checks that a number is greater than zero.
   *
   * @param key Field key, for the message.
   * @param value Number.
   * @returns The number.
   */
  positive(key: string, value: number): number {
    if (!(value > 0)) throw this.error(key, 'must be greater than 0', value);
    return value;
  }

  /**
   * Reads a list of numbers of a fixed length; one number fills every entry.
   *
   * @param key Field key.
   * @param fallback Value when the field is missing; sets the length.
   * @returns Numbers.
   */
  vector(key: string, fallback: number[]): number[] {
    const value = this.value(key);
    if (value === undefined) return fallback;
    const single = solidScriptValueNumber(value);
    if (single !== undefined) return fallback.map(() => single);
    const list = solidScriptValueNumbers(value);
    if (list?.length === fallback.length) return list;
    throw this.error(key, `must be a number or a list of ${fallback.length} numbers`, value);
  }

  /**
   * Reads a switch.
   *
   * @param key Field key.
   * @returns True or false; false when missing.
   */
  flag(key: string): boolean {
    const value = this.value(key);
    if (value === undefined) return false;
    if (typeof value !== 'boolean') throw this.error(key, 'must be Yes or No', value);
    return value;
  }

  /**
   * Builds the error of a field value that cannot be used.
   *
   * @param key Field key.
   * @param rule What the value must be.
   * @param value Given value.
   * @returns Error.
   */
  error(key: string, rule: string, value: SolidScriptValue | number): Error {
    return new Error(`${this.labels.get(key) ?? key} ${rule}, not ${solidScriptValueShow(value)}`);
  }
}
