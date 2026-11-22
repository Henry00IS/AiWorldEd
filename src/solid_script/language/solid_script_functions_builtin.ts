import { SOLID_SCRIPT_FUNCTIONS_EXTRA } from './solid_script_functions_extra.js';
import { SOLID_SCRIPT_FUNCTIONS_MATH } from './solid_script_functions_math.js';
import { SOLID_SCRIPT_FUNCTIONS_SHAPING } from './solid_script_functions_shaping.js';
import { SOLID_SCRIPT_FUNCTIONS_MATRIX } from './solid_script_functions_matrix.js';
import { SOLID_SCRIPT_FUNCTIONS_NOISE } from './solid_script_functions_noise.js';
import { SOLID_SCRIPT_FUNCTIONS_CURVE } from './solid_script_functions_curve.js';
import { SOLID_SCRIPT_FUNCTIONS_CONDITION } from './solid_script_functions_condition.js';
import { SOLID_SCRIPT_FUNCTIONS_WHERE } from './solid_script_functions_where.js';
import { SOLID_SCRIPT_FUNCTIONS_KIND_CHECKS } from './solid_script_functions_kind_checks.js';
import { SOLID_SCRIPT_FUNCTIONS_NUMBERS } from './solid_script_functions_numbers.js';
import { SOLID_SCRIPT_FUNCTIONS_CLUSTER } from './solid_script_functions_cluster.js';
import { SOLID_SCRIPT_FUNCTIONS_COORDINATES } from './solid_script_functions_coordinates.js';
import { solidScriptAxesEach, solidScriptAxesPick } from './solid_script_functions_axes.js';
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
 * Wraps a one-number math function; a vector works per axis.
 *
 * @param name Function name, for the message.
 * @param operation Math function.
 * @returns Built-in.
 */
function solidScriptUnary(name: string, operation: (value: number) => number): SolidScriptBuiltin {
  return solidScriptAxesEach(`${name}(number or vector)`, (args) => {
    const value = solidScriptValueNumber(args[0]);
    return value === undefined ? undefined : operation(value);
  });
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
    throw new Error('lookup needs a number and a list of key, value pairs, such as Lookup([h], [table])');
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
    throw new Error('rands needs min, max, a count from 0 to 10000 and an optional seed, such as Rands(0, 1, 5, 42)');
  let state = (Math.floor(seed ?? 0) ^ 0x9e3779b9) >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: count }, () => low + (high - low) * next());
}

/** Built-in functions by name, with their names as a type. */
const SOLID_SCRIPT_FUNCTIONS_NAMED = {
  sin: solidScriptUnary('Sin', (value) => Math.sin(value * SOLID_SCRIPT_DEGREES)),
  cos: solidScriptUnary('Cos', (value) => Math.cos(value * SOLID_SCRIPT_DEGREES)),
  tan: solidScriptUnary('Tan', (value) => Math.tan(value * SOLID_SCRIPT_DEGREES)),
  asin: solidScriptUnary('Asin', (value) => Math.asin(value) / SOLID_SCRIPT_DEGREES),
  acos: solidScriptUnary('Acos', (value) => Math.acos(value) / SOLID_SCRIPT_DEGREES),
  atan: solidScriptUnary('Atan', (value) => Math.atan(value) / SOLID_SCRIPT_DEGREES),
  atan2: (args) =>
    Math.atan2(solidScriptValueNumber(args[0]) ?? NaN, solidScriptValueNumber(args[1]) ?? NaN) / SOLID_SCRIPT_DEGREES,
  abs: solidScriptUnary('Abs', Math.abs),
  sign: solidScriptUnary('Sign', Math.sign),
  ceil: solidScriptUnary('Ceil', Math.ceil),
  floor: solidScriptUnary('Floor', Math.floor),
  round: solidScriptUnary('Round', Math.round),
  sqrt: solidScriptUnary('Sqrt', Math.sqrt),
  exp: solidScriptUnary('Exp', Math.exp),
  ln: solidScriptUnary('Ln', Math.log),
  pow: solidScriptAxesEach(
    'Pow(number, power)',
    (args) => (solidScriptValueNumber(args[0]) ?? NaN) ** (solidScriptValueNumber(args[1]) ?? NaN),
  ),
  min: solidScriptAxesPick('Min(a, b, ...)', Math.min),
  max: solidScriptAxesPick('Max(a, b, ...)', Math.max),
  norm: (args) => Math.hypot(...(solidScriptValueNumbers(args[0]) ?? [NaN])),
  cross: solidScriptCross,
  len: solidScriptLen,
  concat: (args) => args.flatMap((value) => (Array.isArray(value) ? value : [value])),
  list: (args) => [...args],
  // Parse reads names of the running script, so the formula hands it to the machine.
  parse: () => {
    throw new Error('Parse() works only in a running script');
  },
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
  ...SOLID_SCRIPT_FUNCTIONS_SHAPING,
  ...SOLID_SCRIPT_FUNCTIONS_MATRIX,
  ...SOLID_SCRIPT_FUNCTIONS_NOISE,
  ...SOLID_SCRIPT_FUNCTIONS_CURVE,
  ...SOLID_SCRIPT_FUNCTIONS_CONDITION,
  ...SOLID_SCRIPT_FUNCTIONS_WHERE,
  hits: () => undefined,
  hits_box: () => undefined,
  ...SOLID_SCRIPT_FUNCTIONS_KIND_CHECKS,
  ...SOLID_SCRIPT_FUNCTIONS_NUMBERS,
  ...SOLID_SCRIPT_FUNCTIONS_CLUSTER,
  ...SOLID_SCRIPT_FUNCTIONS_COORDINATES,
} satisfies Readonly<Record<string, SolidScriptBuiltin>>;

/** Name of a built-in function; its kinds must be declared for each. */
export type SolidScriptBuiltinName = keyof typeof SOLID_SCRIPT_FUNCTIONS_NAMED;

/** Built-in functions by name; trigonometry works in degrees. */
export const SOLID_SCRIPT_FUNCTIONS_BUILTIN: Readonly<Record<string, SolidScriptBuiltin>> =
  SOLID_SCRIPT_FUNCTIONS_NAMED;
