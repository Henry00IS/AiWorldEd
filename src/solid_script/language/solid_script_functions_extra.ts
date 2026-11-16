import { solidScriptTimeText } from './solid_script_system.js';
import {
  solidScriptValueNumber,
  solidScriptValueNumbers,
  solidScriptValueText,
  type SolidScriptValue,
} from './solid_script_value.js';

/**
 * Pads text to a width with a fill character.
 *
 * @param args Text, width and fill (a space when missing).
 * @param usage How to call the function, for the message.
 * @param start True pads in front, false behind.
 * @returns Text at least width characters long.
 */
function solidScriptExtraPad(args: readonly SolidScriptValue[], usage: string, start: boolean): string {
  const text = solidScriptExtraText(args, 0, usage);
  const width = Math.floor(solidScriptExtraNumber(args, 1, usage));
  if (width > 10000) throw new Error(`${usage} needs a width up to 10000`);
  const fill = args.length > 2 ? solidScriptExtraText(args, 2, usage) : ' ';
  return start ? text.padStart(width, fill) : text.padEnd(width, fill);
}

/** A built-in function over evaluated arguments. */
type SolidScriptExtra = (args: SolidScriptValue[]) => SolidScriptValue;

/**
 * Reads an argument as text; numbers and lists count as their written form.
 *
 * @param args Arguments.
 * @param index Argument position.
 * @param usage How to call the function, for the message.
 * @returns Text.
 */
export function solidScriptExtraText(args: readonly SolidScriptValue[], index: number, usage: string): string {
  const value = args[index];
  if (value === undefined) throw new Error(`${usage} is missing a value`);
  return typeof value === 'string' ? value : solidScriptValueText(value);
}

/**
 * Reads an argument as a number.
 *
 * @param args Arguments.
 * @param index Argument position.
 * @param usage How to call the function, for the message.
 * @returns Number.
 */
export function solidScriptExtraNumber(args: readonly SolidScriptValue[], index: number, usage: string): number {
  const number = solidScriptValueNumber(args[index]);
  if (number === undefined) throw new Error(`${usage} needs a number, not ${solidScriptValueText(args[index])}`);
  return number;
}

/**
 * Reads an argument as a vector of numbers.
 *
 * @param args Arguments.
 * @param index Argument position.
 * @param usage How to call the function, for the message.
 * @returns Numbers.
 */
function solidScriptExtraVector(args: readonly SolidScriptValue[], index: number, usage: string): number[] {
  const numbers = Array.isArray(args[index]) ? solidScriptValueNumbers(args[index]) : undefined;
  if (!numbers) throw new Error(`${usage} needs a vector such as [1, 2, 3], not ${solidScriptValueText(args[index])}`);
  return numbers;
}

/**
 * Reads two vectors of the same size.
 *
 * @param args Arguments.
 * @param usage How to call the function, for the message.
 * @returns Both vectors.
 */
function solidScriptExtraPair(args: readonly SolidScriptValue[], usage: string): [number[], number[]] {
  const a = solidScriptExtraVector(args, 0, usage);
  const b = solidScriptExtraVector(args, 1, usage);
  if (a.length !== b.length) throw new Error(`${usage} needs two vectors of the same size`);
  return [a, b];
}

/**
 * Builds a pattern from text, with a plain message when it cannot be read.
 *
 * @param pattern Pattern text.
 * @param usage How to call the function, for the message.
 * @returns Pattern.
 */
function solidScriptExtraPattern(pattern: string, usage: string): RegExp {
  try {
    return new RegExp(pattern, 'g');
  } catch {
    throw new Error(`${usage}: the pattern "${pattern}" cannot be read`);
  }
}

/**
 * A number from 0 to 1 that is always the same for the same seed.
 *
 * @param seed Seed.
 * @returns Number from 0 up to 1.
 */
function solidScriptExtraSeeded(seed: number): number {
  let state = (Math.floor(seed * 1000) ^ 0x2545f491) >>> 0;
  state = Math.imul(state ^ (state >>> 16), 0x7feb352d);
  state = Math.imul(state ^ (state >>> 15), 0x846ca68b);
  return ((state ^ (state >>> 16)) >>> 0) / 4294967296;
}

/**
 * Text, math and vector functions: everyday helpers so a script rarely needs a
 * long formula. Names are plain words; trigonometry elsewhere works in
 * degrees.
 */
export const SOLID_SCRIPT_FUNCTIONS_EXTRA: Readonly<Record<string, SolidScriptExtra>> = {
  uppercase: (args) => solidScriptExtraText(args, 0, 'uppercase(text)').toUpperCase(),
  lowercase: (args) => solidScriptExtraText(args, 0, 'lowercase(text)').toLowerCase(),
  trim: (args) => solidScriptExtraText(args, 0, 'trim(text)').trim(),
  contains: (args) =>
    solidScriptExtraText(args, 0, 'contains(text, part)').includes(
      solidScriptExtraText(args, 1, 'contains(text, part)'),
    ),
  starts_with: (args) =>
    solidScriptExtraText(args, 0, 'starts_with(text, part)').startsWith(
      solidScriptExtraText(args, 1, 'starts_with(text, part)'),
    ),
  ends_with: (args) =>
    solidScriptExtraText(args, 0, 'ends_with(text, part)').endsWith(
      solidScriptExtraText(args, 1, 'ends_with(text, part)'),
    ),
  position: (args) =>
    solidScriptExtraText(args, 0, 'position(text, part)').indexOf(
      solidScriptExtraText(args, 1, 'position(text, part)'),
    ),
  part: (args) => {
    const usage = 'part(text, start, count)';
    const text = solidScriptExtraText(args, 0, usage);
    const start = Math.max(0, Math.floor(solidScriptExtraNumber(args, 1, usage)));
    const count = args.length > 2 ? Math.max(0, Math.floor(solidScriptExtraNumber(args, 2, usage))) : text.length;
    return text.slice(start, start + count);
  },
  replace: (args) => {
    const usage = 'replace(text, find, with)';
    return solidScriptExtraText(args, 0, usage)
      .split(solidScriptExtraText(args, 1, usage))
      .join(solidScriptExtraText(args, 2, usage));
  },
  replace_pattern: (args) => {
    const usage = 'replace_pattern(text, pattern, with)';
    return solidScriptExtraText(args, 0, usage).replace(
      solidScriptExtraPattern(solidScriptExtraText(args, 1, usage), usage),
      solidScriptExtraText(args, 2, usage),
    );
  },
  find_pattern: (args) => {
    const usage = 'find_pattern(text, pattern)';
    return [
      ...solidScriptExtraText(args, 0, usage).matchAll(
        solidScriptExtraPattern(solidScriptExtraText(args, 1, usage), usage),
      ),
    ].map((match) => match[0]);
  },
  repeat_text: (args) => {
    const usage = 'repeat_text(text, times)';
    const times = Math.floor(solidScriptExtraNumber(args, 1, usage));
    if (times < 0 || times > 10000) throw new Error(`${usage} needs times from 0 to 10000`);
    return solidScriptExtraText(args, 0, usage).repeat(times);
  },
  reversed: (args) => {
    const value = args[0];
    if (Array.isArray(value)) return [...value].reverse();
    return [...solidScriptExtraText(args, 0, 'reversed(text or list)')].reverse().join('');
  },
  split: (args) => {
    const usage = 'split(text, separator)';
    return solidScriptExtraText(args, 0, usage)
      .split(args.length > 1 ? solidScriptExtraText(args, 1, usage) : ',')
      .map((item) => item.trim());
  },
  join: (args) => {
    const items = Array.isArray(args[0]) ? args[0] : [args[0]];
    const separator = args.length > 1 ? solidScriptExtraText(args, 1, 'join(list, separator)') : ', ';
    return items.map((item) => (typeof item === 'string' ? item : solidScriptValueText(item))).join(separator);
  },
  pad_left: (args) => solidScriptExtraPad(args, 'pad_left(text, width, fill)', true),
  pad_right: (args) => solidScriptExtraPad(args, 'pad_right(text, width, fill)', false),
  trim_start: (args) => solidScriptExtraText(args, 0, 'trim_start(text)').trimStart(),
  trim_end: (args) => solidScriptExtraText(args, 0, 'trim_end(text)').trimEnd(),
  capitalize: (args) => {
    const text = solidScriptExtraText(args, 0, 'capitalize(text)');
    return text.charAt(0).toUpperCase() + text.slice(1);
  },
  title_case: (args) =>
    solidScriptExtraText(args, 0, 'title_case(text)').replace(
      /(^|\s)(\S)/g,
      (_, space, first) => space + first.toUpperCase(),
    ),
  count_text: (args) => {
    const usage = 'count_text(text, part)';
    const find = solidScriptExtraText(args, 1, usage);
    return find === '' ? 0 : solidScriptExtraText(args, 0, usage).split(find).length - 1;
  },
  character_code: (args) => {
    const code = solidScriptExtraText(args, 0, 'character_code(text)').codePointAt(0);
    if (code === undefined) throw new Error('character_code(text) needs at least one character');
    return code;
  },
  character: (args) => {
    const code = solidScriptExtraNumber(args, 0, 'character(code)');
    if (!Number.isInteger(code) || code < 0 || code > 0x10ffff)
      throw new Error('character(code) needs a whole number from 0 to 1114111');
    return String.fromCodePoint(code);
  },
  characters: (args) => [...solidScriptExtraText(args, 0, 'characters(text)')],
  lines: (args) => solidScriptExtraText(args, 0, 'lines(text)').split(/\r?\n/),
  format_number: (args) => {
    const usage = 'format_number(number, decimals, thousands)';
    const decimals = args.length > 1 ? Math.floor(solidScriptExtraNumber(args, 1, usage)) : 2;
    if (decimals < 0 || decimals > 20) throw new Error(`${usage} needs decimals from 0 to 20`);
    const fixed = solidScriptExtraNumber(args, 0, usage).toFixed(decimals);
    if (args.length < 3) return fixed;
    const [whole = '', fraction] = fixed.split('.');
    const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, solidScriptExtraText(args, 2, usage));
    return fraction === undefined ? grouped : `${grouped}.${fraction}`;
  },
  time_text: (args) => {
    const usage = 'time_text(seconds, pattern)';
    return solidScriptTimeText(
      solidScriptExtraNumber(args, 0, usage),
      args.length > 1 ? solidScriptExtraText(args, 1, usage) : 'YYYY-MM-DD HH:mm:ss',
    );
  },
  number: (args) => {
    const number = solidScriptValueNumber(args[0]);
    if (number === undefined) throw new Error(`number(text) cannot read ${solidScriptValueText(args[0])} as a number`);
    return number;
  },
  pick: (args) => {
    const usage = 'pick(number, first, second, ...)';
    const index = Math.floor(solidScriptExtraNumber(args, 0, usage));
    if (index < 0 || index + 1 >= args.length)
      throw new Error(`${usage} has ${args.length - 1} choices, numbered from 0, so ${index} is not one of them`);
    return args[index + 1];
  },
  random: (args) => {
    const usage = 'random(min, max, seed)';
    const low = solidScriptExtraNumber(args, 0, usage);
    const high = solidScriptExtraNumber(args, 1, usage);
    const seed = args.length > 2 ? solidScriptExtraNumber(args, 2, usage) : 0;
    return low + (high - low) * solidScriptExtraSeeded(seed);
  },
  trunc: (args) => Math.trunc(solidScriptExtraNumber(args, 0, 'trunc(number)')),
  clamp: (args) => {
    const usage = 'clamp(value, min, max)';
    return Math.min(
      Math.max(solidScriptExtraNumber(args, 0, usage), solidScriptExtraNumber(args, 1, usage)),
      solidScriptExtraNumber(args, 2, usage),
    );
  },
  lerp: (args) => {
    const usage = 'lerp(from, to, amount)';
    const amount = solidScriptExtraNumber(args, 2, usage);
    if (Array.isArray(args[0]) || Array.isArray(args[1])) {
      const [a, b] = solidScriptExtraPair(args, usage);
      return a.map((value, index) => value + (b[index]! - value) * amount);
    }
    const a = solidScriptExtraNumber(args, 0, usage);
    return a + (solidScriptExtraNumber(args, 1, usage) - a) * amount;
  },
  length: (args) => Math.hypot(...solidScriptExtraVector(args, 0, 'length(vector)')),
  normalize: (args) => {
    const vector = solidScriptExtraVector(args, 0, 'normalize(vector)');
    const size = Math.hypot(...vector);
    if (size === 0) throw new Error('normalize(vector) cannot turn 0, 0, 0 into a direction');
    return vector.map((value) => value / size);
  },
  dot: (args) => {
    const [a, b] = solidScriptExtraPair(args, 'dot(a, b)');
    return a.reduce((sum, value, index) => sum + value * b[index]!, 0);
  },
  distance: (args) => {
    const [a, b] = solidScriptExtraPair(args, 'distance(a, b)');
    return Math.hypot(...a.map((value, index) => value - b[index]!));
  },
  vector: (args) => args.map((_, index) => solidScriptExtraNumber(args, index, 'vector(x, y, z)')),
};
