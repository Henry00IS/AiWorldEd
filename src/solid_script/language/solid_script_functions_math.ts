import { solidScriptExtraNumber } from './solid_script_functions_extra.js';
import { solidScriptValueNumbers, solidScriptValueText, type SolidScriptValue } from './solid_script_value.js';

/** A built-in function over evaluated arguments. */
type SolidScriptMath = (args: SolidScriptValue[]) => SolidScriptValue;

/**
 * Reads an argument as a list.
 *
 * @param args Arguments.
 * @param index Argument position.
 * @param usage How to call the function, for the message.
 * @returns Items.
 */
function solidScriptMathList(args: readonly SolidScriptValue[], index: number, usage: string): SolidScriptValue[] {
  const value = args[index];
  if (!Array.isArray(value)) throw new Error(`${usage} needs a list, not ${solidScriptValueText(value)}`);
  return value;
}

/**
 * Reads an argument as a list of numbers.
 *
 * @param args Arguments.
 * @param usage How to call the function, for the message.
 * @returns Numbers.
 */
function solidScriptMathNumbers(args: readonly SolidScriptValue[], usage: string): number[] {
  const numbers = solidScriptValueNumbers(solidScriptMathList(args, 0, usage));
  if (!numbers) throw new Error(`${usage} needs a list of numbers`);
  return numbers;
}

/**
 * Wraps a number into a range, so it goes round like an angle.
 *
 * @param value Number.
 * @param low Start of the range.
 * @param high End of the range.
 * @returns Number from low up to, not including, high.
 */
function solidScriptMathWrap(value: number, low: number, high: number): number {
  const size = high - low;
  return size === 0 ? low : low + ((((value - low) % size) + size) % size);
}

/** Math and list functions: ranges, smoothing, angles and list picks. */
export const SOLID_SCRIPT_FUNCTIONS_MATH = {
  remap: (args) => {
    const usage = 'Remap(value, from_low, from_high, to_low, to_high)';
    const [value, fromLow, fromHigh, toLow, toHigh] = [0, 1, 2, 3, 4].map((index) =>
      solidScriptExtraNumber(args, index, usage),
    ) as [number, number, number, number, number];
    if (fromHigh === fromLow) throw new Error(`${usage} needs from_low and from_high to differ`);
    return toLow + ((value - fromLow) / (fromHigh - fromLow)) * (toHigh - toLow);
  },
  smoothstep: (args) => {
    const usage = 'Smoothstep(edge_low, edge_high, value)';
    const low = solidScriptExtraNumber(args, 0, usage);
    const high = solidScriptExtraNumber(args, 1, usage);
    const t = Math.min(1, Math.max(0, (solidScriptExtraNumber(args, 2, usage) - low) / (high - low || 1)));
    return t * t * (3 - 2 * t);
  },
  wrap: (args) => {
    const usage = 'Wrap(value, min, max)';
    return solidScriptMathWrap(
      solidScriptExtraNumber(args, 0, usage),
      solidScriptExtraNumber(args, 1, usage),
      solidScriptExtraNumber(args, 2, usage),
    );
  },
  mod: (args) =>
    solidScriptMathWrap(solidScriptExtraNumber(args, 0, 'Mod(a, b)'), 0, solidScriptExtraNumber(args, 1, 'Mod(a, b)')),
  snap: (args) => {
    const usage = 'Snap(value, step)';
    const step = solidScriptExtraNumber(args, 1, usage);
    if (step <= 0) throw new Error(`${usage} needs a step above 0`);
    return Math.round(solidScriptExtraNumber(args, 0, usage) / step) * step;
  },
  fract: (args) => {
    const value = solidScriptExtraNumber(args, 0, 'Fract(value)');
    return value - Math.floor(value);
  },
  radians: (args) => (solidScriptExtraNumber(args, 0, 'Radians(degrees)') * Math.PI) / 180,
  degrees: (args) => (solidScriptExtraNumber(args, 0, 'Degrees(radians)') * 180) / Math.PI,
  hypot: (args) => Math.hypot(...args.map((_, index) => solidScriptExtraNumber(args, index, 'Hypot(a, b, ...)'))),
  between: (args) => {
    const usage = 'Between(value, min, max)';
    const value = solidScriptExtraNumber(args, 0, usage);
    return value >= solidScriptExtraNumber(args, 1, usage) && value <= solidScriptExtraNumber(args, 2, usage);
  },
  sum: (args) => solidScriptMathNumbers(args, 'Sum(list)').reduce((total, value) => total + value, 0),
  average: (args) => {
    const numbers = solidScriptMathNumbers(args, 'Average(list)');
    if (numbers.length === 0) throw new Error('Average(list) needs at least one number');
    return numbers.reduce((total, value) => total + value, 0) / numbers.length;
  },
  first: (args) => solidScriptMathList(args, 0, 'First(list)')[0],
  last: (args) => solidScriptMathList(args, 0, 'Last(list)').at(-1),
  slice: (args) => {
    const usage = 'Slice(list, start, count)';
    const list = solidScriptMathList(args, 0, usage);
    const start = Math.floor(solidScriptExtraNumber(args, 1, usage));
    const count = args.length > 2 ? Math.floor(solidScriptExtraNumber(args, 2, usage)) : list.length;
    return list.slice(start, start + count);
  },
  index_of: (args) => {
    const wanted = solidScriptValueText(args[1]);
    return solidScriptMathList(args, 0, 'IndexOf(list, value)').findIndex(
      (item) => solidScriptValueText(item) === wanted,
    );
  },
  item_or: (args) => {
    const usage = 'ItemOr(list, index, fallback)';
    if (args.length !== 3) throw new Error(`${usage} takes a list, an index and a fallback value`);
    const list = solidScriptMathList(args, 0, usage);
    const index = solidScriptExtraNumber(args, 1, usage);
    return Number.isInteger(index) && index >= 0 && index < list.length ? list[index] : args[2];
  },
  unique: (args) => {
    const seen = new Set<string>();
    return solidScriptMathList(args, 0, 'Unique(list)').filter((item) => {
      const key = solidScriptValueText(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  },
  sorted: (args) =>
    [...solidScriptMathList(args, 0, 'Sorted(list)')].sort((a, b) =>
      typeof a === 'number' && typeof b === 'number'
        ? a - b
        : solidScriptValueText(a).localeCompare(solidScriptValueText(b)),
    ),
} satisfies Readonly<Record<string, SolidScriptMath>>;
