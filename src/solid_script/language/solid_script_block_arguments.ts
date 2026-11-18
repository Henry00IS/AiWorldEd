import { solidScriptKindOf } from './solid_script_kinds.js';
import { solidScriptAnchorRead, type SolidScriptAnchorAxis } from './solid_script_anchor.js';
import {
  solidScriptValueNumber,
  solidScriptValueNumbers,
  solidScriptValueShow,
  solidScriptValueText,
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
    if (number === undefined) throw this.error(key, 'needs a number, such as 2', value);
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
    throw this.error(
      key,
      `needs a number, or ${fallback.length} numbers separated by commas such as ${fallback.map((_, index) => index + 1).join(', ')}`,
      value,
    );
  }

  /**
   * Reads an Anchor field.
   *
   * @param axes Axes it sets.
   * @returns Where the origin sits along each axis of the shape's box, 0 to 1;
   *   the middle when the block has no Anchor.
   */
  anchor(axes: readonly SolidScriptAnchorAxis[]): number[] {
    const value = this.value('anchor');
    if (value === undefined) return axes.map(() => 0.5);
    const read = solidScriptAnchorRead(solidScriptValueText(value), axes);
    if (typeof read === 'string') throw this.error('anchor', read, value);
    return read;
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
    if (typeof value !== 'boolean') throw this.error(key, 'needs Yes or No', value);
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
    const shown = solidScriptValueShow(value);
    const kind = typeof value === 'number' ? '' : ` (${solidScriptKindOf(value)})`;
    return new Error(`${this.labels.get(key) ?? key} ${rule}, not ${shown}${kind}`);
  }
}
