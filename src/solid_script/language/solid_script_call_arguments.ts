import {
  solidScriptValueNumber,
  solidScriptValueNumbers,
  solidScriptValueShow,
  type SolidScriptValue,
} from './solid_script_value.js';

/**
 * Evaluated arguments of a built-in module call, looked up by name or position.
 * Every value given must have the type its command expects, and every value
 * given must be one the command has, so nothing is ever ignored silently.
 */
export class SolidScriptCallArguments {
  private readonly names = new Set<string>();
  private positions = 0;

  /**
   * Creates the argument view.
   *
   * @param moduleName Called module, for error messages.
   * @param positional Positional values in order.
   * @param named Named values.
   */
  constructor(
    readonly moduleName: string,
    private readonly positional: SolidScriptValue[],
    private readonly named: Map<string, SolidScriptValue>,
  ) {}

  /**
   * Returns an argument by name, falling back to a position, and remembers that
   * the command has this value.
   *
   * @param name Argument name.
   * @param position Positional index, or -1 when the argument is named only.
   * @returns Value, or undefined.
   */
  value(name: string, position = -1): SolidScriptValue {
    this.names.add(name);
    this.positions = Math.max(this.positions, position + 1);
    if (this.named.has(name)) return this.named.get(name);
    return position >= 0 ? this.positional[position] : undefined;
  }

  /**
   * Returns a numeric argument; a given value must be a finite number.
   *
   * @param name Argument name.
   * @param position Positional index or -1.
   * @param fallback Value when missing.
   * @returns Number.
   */
  number(name: string, position: number, fallback: number): number {
    const value = this.value(name, position);
    if (value === undefined) return fallback;
    const number = solidScriptValueNumber(value);
    if (number === undefined) throw this.error(name, 'must be a number', value);
    return number;
  }

  /**
   * Returns a number that must be greater than 0.
   *
   * @param name Argument name.
   * @param value Number read.
   * @returns The number.
   */
  positive(name: string, value: number): number {
    if (!(value > 0)) throw this.error(name, 'must be greater than 0', value);
    return value;
  }

  /**
   * Returns a vector argument, accepting a single number for every component; a
   * given list must hold exactly as many numbers as the fallback.
   *
   * @param name Argument name.
   * @param position Positional index or -1.
   * @param fallback Components used when missing.
   * @returns Numbers.
   */
  vector(name: string, position: number, fallback: number[]): number[] {
    const value = this.value(name, position);
    if (value === undefined) return fallback;
    const single = solidScriptValueNumber(value);
    if (single !== undefined) return fallback.map(() => single);
    const list = solidScriptValueNumbers(value);
    if (list?.length === fallback.length) return list;
    throw this.error(name, `must be a number or a list of ${fallback.length} numbers`, value);
  }

  /**
   * Returns a boolean argument; a given value must be true or false.
   *
   * @param name Argument name.
   * @param position Positional index or -1.
   * @returns The value, false when missing.
   */
  flag(name: string, position: number): boolean {
    const value = this.value(name, position);
    if (value === undefined) return false;
    if (typeof value !== 'boolean') throw this.error(name, 'must be true or false', value);
    return value;
  }

  /**
   * Fails when the call gave a value the command does not have: an unknown name
   * or more values in order than it takes. $ settings are always allowed.
   */
  unusedCheck(): void {
    const unknown = [...this.named.keys()].find((name) => !name.startsWith('$') && !this.names.has(name));
    if (unknown !== undefined) {
      const known = [...this.names].join(', ') || 'none';
      throw new Error(`${this.moduleName}() has no value "${unknown}". Its values: ${known}`);
    }
    if (this.positional.length > this.positions) {
      const most = `${this.positions} ${this.positions === 1 ? 'value' : 'values'}`;
      throw new Error(`${this.moduleName}() takes at most ${most} in order, not ${this.positional.length}`);
    }
  }

  /**
   * Builds the error of a value that cannot be used.
   *
   * @param name Argument name.
   * @param rule What the value must be.
   * @param value Given value.
   * @returns Error.
   */
  private error(name: string, rule: string, value: SolidScriptValue): Error {
    return new Error(`${this.moduleName}(): ${name} ${rule}, not ${solidScriptValueShow(value)}`);
  }
}
