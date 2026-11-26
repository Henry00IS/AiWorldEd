import {
  SOLID_SCRIPT_FACING_WITHIN_DEFAULT,
  solidScriptEveryNthHolds,
  solidScriptFacingHolds,
  solidScriptHasTagHolds,
  solidScriptInBoxHolds,
  solidScriptNearHolds,
} from './solid_script_condition.js';
import { solidScriptValueNumber, type SolidScriptValue } from './solid_script_value.js';
import { solidScriptVectorOrSize } from './solid_script_vector.js';

/** Built-in function implementation over evaluated positional arguments. */
type SolidScriptBuiltin = (args: SolidScriptValue[]) => SolidScriptValue;

/**
 * Reads a vector argument, or a single number used on every axis when allowed.
 *
 * @param value Argument.
 * @param uniform Whether one number may stand for a uniform size.
 * @returns Numbers, or undefined.
 */
function solidScriptConditionVector(value: SolidScriptValue, uniform: boolean): number[] | undefined {
  return solidScriptVectorOrSize(value, uniform);
}

/**
 * Facing(normal, direction, within): yes when the first direction points along
 * the second, within a number of degrees.
 *
 * @param args Normal, direction and optional within.
 * @returns Yes or No, or undefined when the values do not fit.
 */
function solidScriptFacing(args: SolidScriptValue[]): SolidScriptValue {
  const normal = solidScriptConditionVector(args[0], false);
  const direction = solidScriptConditionVector(args[1], false);
  const within = args.length < 3 ? SOLID_SCRIPT_FACING_WITHIN_DEFAULT : solidScriptValueNumber(args[2]);
  if (!normal || !direction || within === undefined || within < 0 || within > 180) return undefined;
  return solidScriptFacingHolds(normal, direction, within);
}

/**
 * InBox(point, center, size): yes when the point lies in that box.
 *
 * @param args Point, center and size.
 * @returns Yes or No, or undefined when the values do not fit.
 */
function solidScriptInBox(args: SolidScriptValue[]): SolidScriptValue {
  const point = solidScriptConditionVector(args[0], false);
  const center = solidScriptConditionVector(args[1], false);
  const size = solidScriptConditionVector(args[2], true);
  if (!point || !center || !size) return undefined;
  return solidScriptInBoxHolds(point, center, size);
}

/**
 * Near(point, target, distance): yes when the point is that close to the
 * target.
 *
 * @param args Point, target and distance.
 * @returns Yes or No, or undefined when the values do not fit.
 */
function solidScriptNear(args: SolidScriptValue[]): SolidScriptValue {
  const point = solidScriptConditionVector(args[0], false);
  const target = solidScriptConditionVector(args[1], false);
  const distance = solidScriptValueNumber(args[2]);
  if (!point || !target || distance === undefined || distance < 0) return undefined;
  return solidScriptNearHolds(point, target, distance);
}

/**
 * EveryNth(index, step, start): yes for start, start + step, and so on.
 *
 * @param args Index, step and optional start.
 * @returns Yes or No, or undefined when the values do not fit.
 */
function solidScriptEveryNth(args: SolidScriptValue[]): SolidScriptValue {
  const index = solidScriptValueNumber(args[0]);
  const step = solidScriptValueNumber(args[1]);
  const start = args.length < 3 ? 0 : solidScriptValueNumber(args[2]);
  if (index === undefined || step === undefined || start === undefined) return undefined;
  if (!Number.isInteger(index) || !Number.isInteger(step) || !Number.isInteger(start) || step < 1) return undefined;
  return solidScriptEveryNthHolds(index, step, start);
}

/**
 * HasTag(tags, name): yes when a tag or list of tags includes the name.
 *
 * @param args Tags and name.
 * @returns Yes or No, or undefined when the name is not text.
 */
function solidScriptHasTag(args: SolidScriptValue[]): SolidScriptValue {
  if (typeof args[1] !== 'string') return undefined;
  return solidScriptHasTagHolds(args[0], args[1]);
}

/** Curated condition functions, by stored name. */
export const SOLID_SCRIPT_FUNCTIONS_CONDITION = {
  facing: solidScriptFacing,
  in_box: solidScriptInBox,
  near: solidScriptNear,
  every_nth: solidScriptEveryNth,
  has_tag: solidScriptHasTag,
} as const satisfies Readonly<Record<string, SolidScriptBuiltin>>;
