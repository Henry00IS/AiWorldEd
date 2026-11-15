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
};
