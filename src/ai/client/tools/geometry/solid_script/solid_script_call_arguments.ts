import { solidScriptValueNumber, solidScriptValueNumbers, type SolidScriptValue } from './solid_script_value.js';

/** Evaluated arguments of a built-in module call, looked up by name or position. */
export class SolidScriptCallArguments {
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
   * Returns an argument by name, falling back to a position.
   *
   * @param name Argument name.
   * @param position Positional index, or -1 when the argument is named only.
   * @returns Value, or undefined.
   */
  value(name: string, position = -1): SolidScriptValue {
    if (this.named.has(name)) return this.named.get(name);
    return position >= 0 ? this.positional[position] : undefined;
  }

  /**
   * Returns a numeric argument.
   *
   * @param name Argument name.
   * @param position Positional index or -1.
   * @param fallback Value when missing.
   * @returns Number.
   */
  number(name: string, position: number, fallback: number): number {
    return solidScriptValueNumber(this.value(name, position)) ?? fallback;
  }

  /**
   * Returns a vector argument padded to a length, accepting a single number for
   * every component.
   *
   * @param name Argument name.
   * @param position Positional index or -1.
   * @param fallback Components used when missing.
   * @returns Numbers.
   */
  vector(name: string, position: number, fallback: number[]): number[] {
    const value = this.value(name, position);
    const single = solidScriptValueNumber(value);
    if (single !== undefined) return fallback.map(() => single);
    const list = solidScriptValueNumbers(value);
    if (value !== undefined && !list)
      throw new Error(`${this.moduleName}(): ${name} must be a number or a vector of numbers`);
    return fallback.map((entry, index) => list?.[index] ?? entry);
  }

  /**
   * Returns a boolean argument.
   *
   * @param name Argument name.
   * @param position Positional index or -1.
   * @returns True when truthy.
   */
  flag(name: string, position: number): boolean {
    return Boolean(this.value(name, position));
  }
}
