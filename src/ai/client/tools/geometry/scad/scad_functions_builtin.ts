import { scadValueNumber, scadValueNumbers, scadValueText, type ScadValue } from './scad_value.js';

/** Degrees to radians. */
const SCAD_DEGREES = Math.PI / 180;

/** Built-in function implementation over evaluated positional arguments. */
type ScadBuiltin = (args: ScadValue[]) => ScadValue;

/**
 * Wraps a one-number math function.
 *
 * @param operation Math function.
 * @returns Built-in.
 */
function scadUnary(operation: (value: number) => number): ScadBuiltin {
  return (args) => {
    const value = scadValueNumber(args[0]);
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
function scadNumberList(args: ScadValue[]): number[] {
  const list = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
  return scadValueNumbers(list) ?? [];
}

/**
 * Computes the cross product of two 3D vectors.
 *
 * @param args Two vectors.
 * @returns Cross product, or undefined.
 */
function scadCross(args: ScadValue[]): ScadValue {
  const a = scadValueNumbers(args[0]);
  const b = scadValueNumbers(args[1]);
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
function scadLen(args: ScadValue[]): ScadValue {
  const value = args[0];
  return Array.isArray(value) || typeof value === 'string' ? value.length : undefined;
}

/** Built-in functions by name; trigonometry works in degrees like OpenSCAD. */
export const SCAD_FUNCTIONS_BUILTIN: Readonly<Record<string, ScadBuiltin>> = {
  sin: scadUnary((value) => Math.sin(value * SCAD_DEGREES)),
  cos: scadUnary((value) => Math.cos(value * SCAD_DEGREES)),
  tan: scadUnary((value) => Math.tan(value * SCAD_DEGREES)),
  asin: scadUnary((value) => Math.asin(value) / SCAD_DEGREES),
  acos: scadUnary((value) => Math.acos(value) / SCAD_DEGREES),
  atan: scadUnary((value) => Math.atan(value) / SCAD_DEGREES),
  atan2: (args) => Math.atan2(scadValueNumber(args[0]) ?? NaN, scadValueNumber(args[1]) ?? NaN) / SCAD_DEGREES,
  abs: scadUnary(Math.abs),
  sign: scadUnary(Math.sign),
  ceil: scadUnary(Math.ceil),
  floor: scadUnary(Math.floor),
  round: scadUnary(Math.round),
  sqrt: scadUnary(Math.sqrt),
  exp: scadUnary(Math.exp),
  ln: scadUnary(Math.log),
  log: scadUnary(Math.log10),
  pow: (args) => (scadValueNumber(args[0]) ?? NaN) ** (scadValueNumber(args[1]) ?? NaN),
  min: (args) => Math.min(...scadNumberList(args)),
  max: (args) => Math.max(...scadNumberList(args)),
  norm: (args) => Math.hypot(...(scadValueNumbers(args[0]) ?? [NaN])),
  cross: scadCross,
  len: scadLen,
  concat: (args) => args.flatMap((value) => (Array.isArray(value) ? value : [value])),
  str: (args) => args.map((value) => (typeof value === 'string' ? value : scadValueText(value))).join(''),
  is_undef: (args) => args[0] === undefined,
  is_num: (args) => typeof args[0] === 'number',
  is_list: (args) => Array.isArray(args[0]),
  is_string: (args) => typeof args[0] === 'string',
  is_bool: (args) => typeof args[0] === 'boolean',
};
