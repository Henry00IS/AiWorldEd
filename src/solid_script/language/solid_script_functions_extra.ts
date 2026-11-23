import { solidScriptTimeText } from './solid_script_system.js';
import { solidScriptPathSample } from './solid_script_path_model.js';
import {
  SolidScriptPathElement,
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
export function solidScriptExtraVector(args: readonly SolidScriptValue[], index: number, usage: string): number[] {
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
 * Picks a spot between two numbers or two vectors; on vectors the amount may be
 * a vector too, one amount per axis.
 *
 * @param args From, to and amount.
 * @returns Number or vector.
 */
function solidScriptExtraLerpArguments(args: readonly SolidScriptValue[]): SolidScriptValue {
  const usage = 'Lerp(from, to, amount)';
  if (!Array.isArray(args[0]) && !Array.isArray(args[1])) {
    const a = solidScriptExtraNumber(args, 0, usage);
    return a + (solidScriptExtraNumber(args, 1, usage) - a) * solidScriptExtraNumber(args, 2, usage);
  }
  const [a, b] = solidScriptExtraPair(args, usage);
  const amounts = Array.isArray(args[2]) ? solidScriptExtraVector(args, 2, usage) : undefined;
  if (amounts && amounts.length !== a.length) throw new Error(`${usage} needs an amount per axis of the vectors`);
  const amount = amounts ? 0 : solidScriptExtraNumber(args, 2, usage);
  return a.map((value, axis) => value + ((b[axis] ?? value) - value) * (amounts?.[axis] ?? amount));
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
export function solidScriptExtraSeeded(seed: number): number {
  let state = (Math.floor(seed * 1000) ^ 0x2545f491) >>> 0;
  state = Math.imul(state ^ (state >>> 16), 0x7feb352d);
  state = Math.imul(state ^ (state >>> 15), 0x846ca68b);
  return ((state ^ (state >>> 16)) >>> 0) / 4294967296;
}

/**
 * Turns a value into a number so Hash can seed from it.
 *
 * @param value Value.
 * @returns Number.
 */
function solidScriptExtraHashKey(value: SolidScriptValue): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  const text = solidScriptValueText(value);
  let hash = 0;
  for (const char of text) hash = Math.imul(hash, 31) + (char.codePointAt(0) ?? 0);
  return hash;
}

/**
 * Smooth noise from 0 to 1 at a point, always the same for the same seed.
 *
 * @param x Lattice x.
 * @param y Lattice y.
 * @param z Lattice z.
 * @param seed Seed.
 * @returns Number from 0 to 1.
 */
export function solidScriptExtraNoise(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = solidScriptExtraFade(x - ix);
  const fy = solidScriptExtraFade(y - iy);
  const fz = solidScriptExtraFade(z - iz);
  const at = (cx: number, cy: number, cz: number) =>
    solidScriptExtraSeeded(seed + cx * 73856093 + cy * 19349663 + cz * 83492791);
  const x0 = solidScriptExtraLerp(at(ix, iy, iz), at(ix + 1, iy, iz), fx);
  const x1 = solidScriptExtraLerp(at(ix, iy + 1, iz), at(ix + 1, iy + 1, iz), fx);
  const x2 = solidScriptExtraLerp(at(ix, iy, iz + 1), at(ix + 1, iy, iz + 1), fx);
  const x3 = solidScriptExtraLerp(at(ix, iy + 1, iz + 1), at(ix + 1, iy + 1, iz + 1), fx);
  return solidScriptExtraLerp(solidScriptExtraLerp(x0, x1, fy), solidScriptExtraLerp(x2, x3, fy), fz);
}

/**
 * Smooth fade from 0 to 1.
 *
 * @param value Fraction.
 * @returns Smoothed fraction.
 */
function solidScriptExtraFade(value: number): number {
  return value * value * (3 - 2 * value);
}

/**
 * Linear blend.
 *
 * @param from Start.
 * @param to End.
 * @param amount How far along, from 0 to 1.
 * @returns Blended value.
 */
function solidScriptExtraLerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

/**
 * Shuffles a list. One seed always gives the same order.
 *
 * @param list Items.
 * @param seed Seed.
 * @returns A new list in the shuffled order.
 */
function solidScriptExtraShuffle(list: readonly SolidScriptValue[], seed: number): SolidScriptValue[] {
  const items = [...list];
  for (let index = items.length - 1; index > 0; index--) {
    const swap = Math.floor(solidScriptExtraSeeded(seed + index) * (index + 1));
    const left = items[index];
    const right = items[swap];
    if (left === undefined || right === undefined) continue;
    items[index] = right;
    items[swap] = left;
  }
  return items;
}

/**
 * Index of the closest point in a list, optionally skipping one index so a
 * point finds its nearest other point, and optionally only among the points of
 * one group.
 *
 * @param args Points, the point to measure from, an index to skip, the group of
 *   each point and the group to search.
 * @returns Index from 0, or -1 when no other point is left.
 */
function solidScriptExtraNearest(args: readonly SolidScriptValue[]): number {
  const usage = 'Nearest(points, point, skip, groups, group)';
  const given = args[0];
  const list = given instanceof SolidScriptPathElement ? solidScriptPathSample(given.path) : given;
  if (!Array.isArray(list) || list.length === 0)
    throw new Error(`${usage} needs a list of points, not ${solidScriptValueText(list)}`);
  const from = solidScriptExtraVector(args, 1, usage);
  const skip = args.length > 2 ? solidScriptExtraNumber(args, 2, usage) : -1;
  const searched = solidScriptExtraNearestSearched(args, list.length, usage);
  let best = -1;
  let nearest = Number.POSITIVE_INFINITY;
  list.forEach((entry, index) => {
    const distance = solidScriptExtraNearestDistance(entry, from, usage);
    if (index !== skip && searched(index) && distance < nearest) [nearest, best] = [distance, index];
  });
  return best;
}

/**
 * Tells which points Nearest may pick: every point, or only those whose group
 * is the searched group.
 *
 * @param args Nearest arguments, with the groups fourth and the group fifth.
 * @param count How many points there are.
 * @param usage Usage text for errors.
 * @returns Whether a point index may be picked.
 */
function solidScriptExtraNearestSearched(
  args: readonly SolidScriptValue[],
  count: number,
  usage: string,
): (index: number) => boolean {
  if (args.length < 4) return () => true;
  const groups = solidScriptExtraVector(args, 3, usage);
  if (groups.length !== count) throw new Error(`${usage} needs one group per point, ${count} in all`);
  const group = solidScriptExtraNumber(args, 4, usage);
  return (index) => groups[index] === group;
}

/**
 * Distance from a list entry to the point Nearest measures from.
 *
 * @param entry Point from the list.
 * @param from Point to measure from.
 * @param usage Usage text for errors.
 * @returns Straight-line distance.
 */
function solidScriptExtraNearestDistance(entry: SolidScriptValue, from: readonly number[], usage: string): number {
  const point = solidScriptValueNumbers(entry);
  if (!point || point.length !== from.length)
    throw new Error(`${usage} needs points that all have the same number of values as the point`);
  return Math.hypot(...point.map((value, axis) => value - (from[axis] ?? 0)));
}

/**
 * Text, math and vector functions: everyday helpers so a script rarely needs a
 * long formula. Names are plain words; trigonometry elsewhere works in
 * degrees.
 */
export const SOLID_SCRIPT_FUNCTIONS_EXTRA = {
  uppercase: (args) => solidScriptExtraText(args, 0, 'Uppercase(text)').toUpperCase(),
  lowercase: (args) => solidScriptExtraText(args, 0, 'Lowercase(text)').toLowerCase(),
  trim: (args) => solidScriptExtraText(args, 0, 'Trim(text)').trim(),
  starts_with: (args) =>
    solidScriptExtraText(args, 0, 'StartsWith(text, part)').startsWith(
      solidScriptExtraText(args, 1, 'StartsWith(text, part)'),
    ),
  ends_with: (args) =>
    solidScriptExtraText(args, 0, 'EndsWith(text, part)').endsWith(
      solidScriptExtraText(args, 1, 'EndsWith(text, part)'),
    ),
  position: (args) =>
    solidScriptExtraText(args, 0, 'Position(text, part)').indexOf(
      solidScriptExtraText(args, 1, 'Position(text, part)'),
    ),
  part: (args) => {
    const usage = 'Part(text, start, count)';
    const text = solidScriptExtraText(args, 0, usage);
    const start = Math.max(0, Math.floor(solidScriptExtraNumber(args, 1, usage)));
    const count = args.length > 2 ? Math.max(0, Math.floor(solidScriptExtraNumber(args, 2, usage))) : text.length;
    return text.slice(start, start + count);
  },
  replace: (args) => {
    const usage = 'Replace(text, find, with)';
    return solidScriptExtraText(args, 0, usage)
      .split(solidScriptExtraText(args, 1, usage))
      .join(solidScriptExtraText(args, 2, usage));
  },
  replace_pattern: (args) => {
    const usage = 'ReplacePattern(text, pattern, with)';
    return solidScriptExtraText(args, 0, usage).replace(
      solidScriptExtraPattern(solidScriptExtraText(args, 1, usage), usage),
      solidScriptExtraText(args, 2, usage),
    );
  },
  find_pattern: (args) => {
    const usage = 'FindPattern(text, pattern)';
    return [
      ...solidScriptExtraText(args, 0, usage).matchAll(
        solidScriptExtraPattern(solidScriptExtraText(args, 1, usage), usage),
      ),
    ].map((match) => match[0]);
  },
  repeat_text: (args) => {
    const usage = 'RepeatText(text, times)';
    const times = Math.floor(solidScriptExtraNumber(args, 1, usage));
    if (times < 0 || times > 10000) throw new Error(`${usage} needs times from 0 to 10000`);
    return solidScriptExtraText(args, 0, usage).repeat(times);
  },
  reversed: (args) => {
    const value = args[0];
    if (Array.isArray(value)) return [...value].reverse();
    return [...solidScriptExtraText(args, 0, 'Reversed(text or list)')].reverse().join('');
  },
  split: (args) => {
    const usage = 'Split(text, separator)';
    return solidScriptExtraText(args, 0, usage)
      .split(args.length > 1 ? solidScriptExtraText(args, 1, usage) : ',')
      .map((item) => item.trim());
  },
  join: (args) => {
    const items = Array.isArray(args[0]) ? args[0] : [args[0]];
    const separator = args.length > 1 ? solidScriptExtraText(args, 1, 'Join(list, separator)') : ', ';
    return items.map((item) => (typeof item === 'string' ? item : solidScriptValueText(item))).join(separator);
  },
  pad_left: (args) => solidScriptExtraPad(args, 'PadLeft(text, width, fill)', true),
  pad_right: (args) => solidScriptExtraPad(args, 'PadRight(text, width, fill)', false),
  trim_start: (args) => solidScriptExtraText(args, 0, 'TrimStart(text)').trimStart(),
  trim_end: (args) => solidScriptExtraText(args, 0, 'TrimEnd(text)').trimEnd(),
  capitalize: (args) => {
    const text = solidScriptExtraText(args, 0, 'Capitalize(text)');
    return text.charAt(0).toUpperCase() + text.slice(1);
  },
  title_case: (args) =>
    solidScriptExtraText(args, 0, 'TitleCase(text)').replace(
      /(^|\s)(\S)/g,
      (_, space, first) => space + first.toUpperCase(),
    ),
  count_text: (args) => {
    const usage = 'CountText(text, part)';
    const find = solidScriptExtraText(args, 1, usage);
    return find === '' ? 0 : solidScriptExtraText(args, 0, usage).split(find).length - 1;
  },
  character_code: (args) => {
    const code = solidScriptExtraText(args, 0, 'CharacterCode(text)').codePointAt(0);
    if (code === undefined) throw new Error('CharacterCode(text) needs at least one character');
    return code;
  },
  character: (args) => {
    const code = solidScriptExtraNumber(args, 0, 'Character(code)');
    if (!Number.isInteger(code) || code < 0 || code > 0x10ffff)
      throw new Error('Character(code) needs a whole number from 0 to 1114111');
    return String.fromCodePoint(code);
  },
  characters: (args) => [...solidScriptExtraText(args, 0, 'Characters(text)')],
  lines: (args) => solidScriptExtraText(args, 0, 'Lines(text)').split(/\r?\n/),
  format_number: (args) => {
    const usage = 'FormatNumber(number, decimals, thousands)';
    const decimals = args.length > 1 ? Math.floor(solidScriptExtraNumber(args, 1, usage)) : 2;
    if (decimals < 0 || decimals > 20) throw new Error(`${usage} needs decimals from 0 to 20`);
    const fixed = solidScriptExtraNumber(args, 0, usage).toFixed(decimals);
    if (args.length < 3) return fixed;
    const [whole = '', fraction] = fixed.split('.');
    const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, solidScriptExtraText(args, 2, usage));
    return fraction === undefined ? grouped : `${grouped}.${fraction}`;
  },
  time_text: (args) => {
    const usage = 'TimeText(seconds, pattern)';
    return solidScriptTimeText(
      solidScriptExtraNumber(args, 0, usage),
      args.length > 1 ? solidScriptExtraText(args, 1, usage) : 'YYYY-MM-DD HH:mm:ss',
    );
  },
  number: (args) => {
    const number = solidScriptValueNumber(args[0]);
    if (number === undefined) throw new Error(`Number(text) cannot read ${solidScriptValueText(args[0])} as a number`);
    return number;
  },
  pick: (args) => {
    const usage = 'Pick(number, first, second, ...)';
    const index = Math.floor(solidScriptExtraNumber(args, 0, usage));
    if (index < 0 || index + 1 >= args.length)
      throw new Error(`${usage} has ${args.length - 1} choices, numbered from 0, so ${index} is not one of them`);
    return args[index + 1];
  },
  hash: (args) => {
    const usage = 'Hash(value, seed)';
    if (args.length < 1) throw new Error(`${usage} needs a value`);
    const seed = args.length > 1 ? solidScriptExtraNumber(args, 1, usage) : 0;
    return solidScriptExtraSeeded(solidScriptExtraHashKey(args[0]) + seed);
  },
  shuffle: (args) => {
    const usage = 'Shuffle(list, seed)';
    const value = args[0];
    if (!Array.isArray(value)) throw new Error(`${usage} needs a list, not ${solidScriptValueText(value)}`);
    const seed = args.length > 1 ? solidScriptExtraNumber(args, 1, usage) : 0;
    return solidScriptExtraShuffle(value, seed);
  },
  nearest: (args) => solidScriptExtraNearest(args),
  trunc: (args) => Math.trunc(solidScriptExtraNumber(args, 0, 'Trunc(number)')),
  clamp: (args) => {
    const usage = 'Clamp(value, min, max)';
    const ends = [solidScriptExtraNumber(args, 1, usage), solidScriptExtraNumber(args, 2, usage)];
    return Math.min(Math.max(solidScriptExtraNumber(args, 0, usage), Math.min(...ends)), Math.max(...ends));
  },
  lerp: solidScriptExtraLerpArguments,
  length: (args) => Math.hypot(...solidScriptExtraVector(args, 0, 'Length(vector)')),
  normalize: (args) => {
    const vector = solidScriptExtraVector(args, 0, 'Normalize(vector)');
    const size = Math.hypot(...vector);
    if (size === 0) throw new Error('Normalize(vector) cannot turn 0, 0, 0 into a direction');
    return vector.map((value) => value / size);
  },
  dot: (args) => {
    const [a, b] = solidScriptExtraPair(args, 'Dot(a, b)');
    return a.reduce((sum, value, index) => sum + value * b[index]!, 0);
  },
  distance: (args) => {
    const [a, b] = solidScriptExtraPair(args, 'Distance(a, b)');
    return Math.hypot(...a.map((value, index) => value - b[index]!));
  },
  vector: (args) => args.map((_, index) => solidScriptExtraNumber(args, index, 'Vector(x, y, z)')),
} satisfies Readonly<Record<string, SolidScriptExtra>>;
