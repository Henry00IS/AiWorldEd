import { solidScriptAxesEach } from './solid_script_functions_axes.js';
import { solidScriptExtraNumber } from './solid_script_functions_extra.js';
import {
  solidScriptValueNumbers,
  solidScriptValueText,
  solidScriptValueTruthy,
  type SolidScriptValue,
} from './solid_script_value.js';

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
 * Moves a number from one range into another, kept inside the target range when
 * clamped.
 *
 * @param args Value, the two ranges and Clamp.
 * @returns Number.
 */
function solidScriptShapingRemap(args: readonly SolidScriptValue[]): number {
  const usage = 'Remap(value, from_low, from_high, to_low, to_high, clamp)';
  const [value, fromLow, fromHigh, toLow, toHigh] = [0, 1, 2, 3, 4].map((index) =>
    solidScriptExtraNumber(args, index, usage),
  ) as [number, number, number, number, number];
  if (fromHigh === fromLow) throw new Error(`${usage} needs from_low and from_high to differ`);
  const mapped = toLow + ((value - fromLow) / (fromHigh - fromLow)) * (toHigh - toLow);
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
 * Shaping functions: smooth minimum and maximum, bounce, ranges and running
 * sums.
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
  remap: solidScriptAxesEach('Remap(value, from_low, from_high, to_low, to_high, clamp)', solidScriptShapingRemap),
  accumulate: solidScriptShapingAccumulate,
} satisfies Readonly<Record<string, SolidScriptShaping>>;
