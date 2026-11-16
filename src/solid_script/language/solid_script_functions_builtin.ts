import { SOLID_SCRIPT_FUNCTIONS_EXTRA } from './solid_script_functions_extra.js';
import { SOLID_SCRIPT_FUNCTIONS_MATH } from './solid_script_functions_math.js';
import { SOLID_SCRIPT_FUNCTIONS_CURVE } from './solid_script_functions_curve.js';
import {
  solidScriptValueNumber,
  solidScriptValueNumbers,
  solidScriptValueText,
  type SolidScriptValue,
} from './solid_script_value.js';

/** Degrees to radians. */
const SOLID_SCRIPT_DEGREES = Math.PI / 180;

/** Built-in function implementation over evaluated positional arguments. */
type SolidScriptBuiltin = (args: SolidScriptValue[]) => SolidScriptValue;

/**
 * Wraps a one-number math function.
 *
 * @param operation Math function.
 * @returns Built-in.
 */
function solidScriptUnary(operation: (value: number) => number): SolidScriptBuiltin {
  return (args) => {
    const value = solidScriptValueNumber(args[0]);
    return value === undefined ? undefined : operation(value);
  };
}

/**
 * Collects the numbers of min()/max() arguments: either one vector or many
 * numbers.
 *
 * @param args Arguments.
 * @returns Numbers.
 */
function solidScriptNumberList(args: SolidScriptValue[]): number[] {
  const list = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
  return solidScriptValueNumbers(list) ?? [];
}

/**
 * Computes the cross product of two 3D vectors.
 *
 * @param args Two vectors.
 * @returns Cross product, or undefined.
 */
function solidScriptCross(args: SolidScriptValue[]): SolidScriptValue {
  const a = solidScriptValueNumbers(args[0]);
  const b = solidScriptValueNumbers(args[1]);
  if (!a || !b || a.length !== 3 || b.length !== 3) return undefined;
  const [ax, ay, az] = a as [number, number, number];
  const [bx, by, bz] = b as [number, number, number];
  return [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
}

/**
 * Computes the length of a vector or string.
 *
 * @param args One value.
 * @returns Length, or undefined.
 */
function solidScriptLen(args: SolidScriptValue[]): SolidScriptValue {
  const value = args[0];
  return Array.isArray(value) || typeof value === 'string' ? value.length : undefined;
}

/** Built-in functions by name; trigonometry works in degrees . */
/**
 * Lookup(key, table): reads a value from a table of key, value pairs sorted by
 * key, blending linearly between the two nearest keys and holding the ends.
 *
 * @param args Key and table.
 * @returns Value.
 */
function solidScriptLookup(args: SolidScriptValue[]): SolidScriptValue {
  const key = solidScriptValueNumber(args[0]);
  const table = Array.isArray(args[1]) ? args[1].map((row) => solidScriptValueNumbers(row)) : null;
  if (key === undefined || !table || table.length === 0 || table.some((row) => !row || row.length !== 2))
    throw new Error('lookup needs a number and a list of key, value pairs, such as lookup([h], [table])');
  const rows = (table as [number, number][]).slice().sort((a, b) => a[0] - b[0]);
  if (key <= rows[0]![0]) return rows[0]![1];
  for (let index = 1; index < rows.length; index++) {
    const [k1, v1] = rows[index]!;
    if (key <= k1) {
      const [k0, v0] = rows[index - 1]!;
      return k1 === k0 ? v1 : v0 + ((v1 - v0) * (key - k0)) / (k1 - k0);
    }
  }
  return rows[rows.length - 1]![1];
}

/**
 * Rands(min, max, count, seed): a list of random numbers from min to max. The
 * same seed always gives the same numbers, so the level looks the same after
 * every rebuild; the seed is 0 when left out.
 *
 * @param args Range, count and optional seed.
 * @returns Numbers.
 */
function solidScriptRands(args: SolidScriptValue[]): SolidScriptValue {
  const [low, high, count, seed] = [0, 1, 2, 3].map((index) => solidScriptValueNumber(args[index]));
  if (
    low === undefined ||
    high === undefined ||
    count === undefined ||
    !Number.isInteger(count) ||
    count < 0 ||
    count > 10000
  )
    throw new Error('rands needs min, max, a count from 0 to 10000 and an optional seed, such as rands(0, 1, 5, 42)');
  let state = (Math.floor(seed ?? 0) ^ 0x9e3779b9) >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: count }, () => low + (high - low) * next());
}

export const SOLID_SCRIPT_FUNCTIONS_BUILTIN: Readonly<Record<string, SolidScriptBuiltin>> = {
  sin: solidScriptUnary((value) => Math.sin(value * SOLID_SCRIPT_DEGREES)),
  cos: solidScriptUnary((value) => Math.cos(value * SOLID_SCRIPT_DEGREES)),
  tan: solidScriptUnary((value) => Math.tan(value * SOLID_SCRIPT_DEGREES)),
  asin: solidScriptUnary((value) => Math.asin(value) / SOLID_SCRIPT_DEGREES),
  acos: solidScriptUnary((value) => Math.acos(value) / SOLID_SCRIPT_DEGREES),
  atan: solidScriptUnary((value) => Math.atan(value) / SOLID_SCRIPT_DEGREES),
  atan2: (args) =>
    Math.atan2(solidScriptValueNumber(args[0]) ?? NaN, solidScriptValueNumber(args[1]) ?? NaN) / SOLID_SCRIPT_DEGREES,
  abs: solidScriptUnary(Math.abs),
  sign: solidScriptUnary(Math.sign),
  ceil: solidScriptUnary(Math.ceil),
  floor: solidScriptUnary(Math.floor),
  round: solidScriptUnary(Math.round),
  sqrt: solidScriptUnary(Math.sqrt),
  exp: solidScriptUnary(Math.exp),
  ln: solidScriptUnary(Math.log),
  log: solidScriptUnary(Math.log10),
  pow: (args) => (solidScriptValueNumber(args[0]) ?? NaN) ** (solidScriptValueNumber(args[1]) ?? NaN),
  min: (args) => Math.min(...solidScriptNumberList(args)),
  max: (args) => Math.max(...solidScriptNumberList(args)),
  norm: (args) => Math.hypot(...(solidScriptValueNumbers(args[0]) ?? [NaN])),
  cross: solidScriptCross,
  len: solidScriptLen,
  concat: (args) => args.flatMap((value) => (Array.isArray(value) ? value : [value])),
  str: (args) => args.map((value) => (typeof value === 'string' ? value : solidScriptValueText(value))).join(''),
  is_undef: (args) => args[0] === undefined,
  is_num: (args) => typeof args[0] === 'number',
  is_list: (args) => Array.isArray(args[0]),
  is_string: (args) => typeof args[0] === 'string',
  is_bool: (args) => typeof args[0] === 'boolean',
  lookup: solidScriptLookup,
  rands: solidScriptRands,
  ...SOLID_SCRIPT_FUNCTIONS_EXTRA,
  ...SOLID_SCRIPT_FUNCTIONS_MATH,
  ...SOLID_SCRIPT_FUNCTIONS_CURVE,
};
