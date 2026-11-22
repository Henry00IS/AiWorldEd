import * as THREE from 'three';
import { solidScriptAxesEach } from './solid_script_functions_axes.js';
import { solidScriptExtraNumber } from './solid_script_functions_extra.js';
import {
  solidScriptValueNumbers,
  solidScriptValueText,
  solidScriptValueTruthy,
  type SolidScriptValue,
} from './solid_script_value.js';

/** How to call Remap, for messages. */
const SOLID_SCRIPT_SHAPING_REMAP_USAGE = 'Remap(value, from_low, from_high, to_low, to_high, clamp, steps, ease)';

/** A built-in function over evaluated arguments. */
type SolidScriptShaping = (args: SolidScriptValue[]) => SolidScriptValue;

/**
 * The smaller of two numbers, rounded off where they come within a distance of
 * each other so the switch from one to the other has no corner.
 *
 * @param a First number.
 * @param b Second number.
 * @param distance How far apart they blend; 0 is a plain minimum.
 * @returns Blended minimum.
 */
function solidScriptShapingSmoothMin(a: number, b: number, distance: number): number {
  if (distance <= 0) return Math.min(a, b);
  const blend = Math.max(distance - Math.abs(a - b), 0) / distance;
  return Math.min(a, b) - (blend * blend * distance) / 4;
}

/**
 * Bounces a number back and forth between 0 and a length.
 *
 * @param value Number.
 * @param length Top of the bounce; 0 gives 0.
 * @returns Number from 0 to length.
 */
function solidScriptShapingPingPong(value: number, length: number): number {
  if (length === 0) return 0;
  const span = Math.abs(length) * 2;
  const along = ((value % span) + span) % span;
  return Math.abs(length) - Math.abs(along - Math.abs(length));
}

/**
 * Rounds a 0-to-1 amount down into steps, the way a stepped remap does; no
 * Steps given, or Steps 0, leaves it smooth.
 *
 * @param amount Amount from the low end to the high end.
 * @param args Remap arguments, with Steps seventh.
 * @param usage How to call the function, for the message.
 * @returns Stepped amount.
 */
function solidScriptShapingSteps(amount: number, args: readonly SolidScriptValue[], usage: string): number {
  const steps = args.length > 6 ? Math.round(solidScriptExtraNumber(args, 6, usage)) : 0;
  if (steps < 0) throw new Error(`${usage} needs Steps of 0 or more`);
  return steps === 0 ? amount : Math.floor(amount * (steps + 1)) / steps;
}

/**
 * Eases a blend gently at both edges, when Ease asks; otherwise leaves it
 * linear, including amounts past the ends.
 *
 * @param amount Blend amount.
 * @param args Remap arguments, with Ease eighth.
 * @param usage How to call the function, for the message.
 * @returns Eased amount.
 */
function solidScriptShapingEase(amount: number, args: readonly SolidScriptValue[], usage: string): number {
  const ease = args.length > 7 ? solidScriptValueText(args[7]).toLowerCase() : 'linear';
  if (ease === 'linear') return amount;
  if (ease === 'smoothstep') return THREE.MathUtils.smoothstep(amount, 0, 1);
  if (ease === 'smootherstep') return THREE.MathUtils.smootherstep(amount, 0, 1);
  throw new Error(`${usage} needs Ease Linear, Smoothstep or Smootherstep`);
}

/**
 * Moves a number from one range into another, kept inside the target range when
 * clamped, and in steps when Steps is given.
 *
 * @param args Value, the two ranges, Clamp, Steps and Ease.
 * @returns Number.
 */
function solidScriptShapingRemap(args: readonly SolidScriptValue[]): number {
  const usage = SOLID_SCRIPT_SHAPING_REMAP_USAGE;
  const [value, fromLow, fromHigh, toLow, toHigh] = [0, 1, 2, 3, 4].map((index) =>
    solidScriptExtraNumber(args, index, usage),
  ) as [number, number, number, number, number];
  if (fromHigh === fromLow) throw new Error(`${usage} needs from_low and from_high to differ`);
  const stepped = solidScriptShapingSteps((value - fromLow) / (fromHigh - fromLow), args, usage);
  const amount = solidScriptShapingEase(stepped, args, usage);
  const mapped = toLow + amount * (toHigh - toLow);
  const clamp = args.length < 6 || solidScriptValueTruthy(args[5] ?? true);
  return clamp ? Math.min(Math.max(toLow, toHigh), Math.max(Math.min(toLow, toHigh), mapped)) : mapped;
}

/**
 * Running sums of a list of numbers.
 *
 * @param args The list.
 * @returns Sum up to and including each item.
 */
function solidScriptShapingAccumulate(args: readonly SolidScriptValue[]): number[] {
  const numbers = Array.isArray(args[0]) ? solidScriptValueNumbers(args[0]) : undefined;
  if (!numbers) throw new Error(`Accumulate(list) needs a list of numbers, not ${solidScriptValueText(args[0])}`);
  let total = 0;
  return numbers.map((value) => (total += value));
}

/**
 * Says whether a point falls in an odd square of a checkerboard of unit
 * squares, scaled; points on a square's edge belong to the square below.
 *
 * @param args Position, as a number or vector, and the scale.
 * @returns 1 in an odd square, 0 in an even one.
 */
function solidScriptShapingChecker(args: readonly SolidScriptValue[]): number {
  const usage = 'Checker(position, scale)';
  const scale = args.length > 1 ? solidScriptExtraNumber(args, 1, usage) : 1;
  const position = Array.isArray(args[0]) ? solidScriptValueNumbers(args[0]) : [solidScriptExtraNumber(args, 0, usage)];
  if (!position) throw new Error(`${usage} needs a number or a vector, not ${solidScriptValueText(args[0])}`);
  const squares = position.reduce((total, value) => total + Math.floor((value * scale + 0.000001) * 0.999999), 0);
  return Math.abs(squares) % 2;
}

/**
 * Shaping functions: smooth minimum and maximum, bounce, ranges, running sums,
 * repeating waves and a checkerboard.
 */
export const SOLID_SCRIPT_FUNCTIONS_SHAPING = {
  smooth_min: solidScriptAxesEach('SmoothMin(a, b, distance)', (args) => {
    const usage = 'SmoothMin(a, b, distance)';
    const [a, b, distance] = [0, 1, 2].map((index) => solidScriptExtraNumber(args, index, usage)) as [
      number,
      number,
      number,
    ];
    return solidScriptShapingSmoothMin(a, b, distance);
  }),
  smooth_max: solidScriptAxesEach('SmoothMax(a, b, distance)', (args) => {
    const usage = 'SmoothMax(a, b, distance)';
    const [a, b, distance] = [0, 1, 2].map((index) => solidScriptExtraNumber(args, index, usage)) as [
      number,
      number,
      number,
    ];
    return -solidScriptShapingSmoothMin(-a, -b, distance);
  }),
  ping_pong: solidScriptAxesEach('PingPong(value, length)', (args) =>
    solidScriptShapingPingPong(
      solidScriptExtraNumber(args, 0, 'PingPong(value, length)'),
      solidScriptExtraNumber(args, 1, 'PingPong(value, length)'),
    ),
  ),
  remap: solidScriptAxesEach(SOLID_SCRIPT_SHAPING_REMAP_USAGE, solidScriptShapingRemap),
  accumulate: solidScriptShapingAccumulate,
  saw: solidScriptAxesEach('Saw(value)', (args) => {
    const value = solidScriptExtraNumber(args, 0, 'Saw(value)');
    return value - Math.floor(value);
  }),
  triangle: solidScriptAxesEach('Triangle(value)', (args) => {
    const value = solidScriptExtraNumber(args, 0, 'Triangle(value)');
    return Math.abs(value - Math.floor(value + 0.5)) * 2;
  }),
  checker: solidScriptShapingChecker,
} satisfies Readonly<Record<string, SolidScriptShaping>>;
