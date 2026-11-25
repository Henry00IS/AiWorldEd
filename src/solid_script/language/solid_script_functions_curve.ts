import type { Curve } from '@/curve/model/curve_model.js';
import { curveEvaluate } from '@/curve/model/curve_sample.js';
import { generatorRevolveStationsFromCurve } from '@/generator/revolve/generator_revolve_curve.js';
import { solidScriptAxesEach } from './solid_script_functions_axes.js';
import { solidScriptCurveProfilePoints, solidScriptCurveProfileSideRead } from './solid_script_curve_profile.js';
import { solidScriptCurveFromText } from './solid_script_curve_read.js';
import { solidScriptExtraNumber } from './solid_script_functions_extra.js';
import {
  solidScriptPathAt,
  solidScriptPathDirection,
  solidScriptPathLength,
  solidScriptPathResample,
  solidScriptPathResampleEvery,
  solidScriptPathTrim,
} from './solid_script_path.js';
import {
  SolidScriptPathElement,
  solidScriptValueNumbers,
  solidScriptValueText,
  type SolidScriptValue,
} from './solid_script_value.js';
import { solidScriptPathWalk } from './solid_script_path_model.js';

/** A built-in function over evaluated arguments. */
type SolidScriptCurveFunction = (args: SolidScriptValue[]) => SolidScriptValue;

/** Most curves kept decoded, by their text. */
const SOLID_SCRIPT_CURVE_CACHE_LIMIT = 64;

/** Decoded curves by their text, so a loop does not decode one every round. */
const SOLID_SCRIPT_CURVES = new Map<string, Curve>();

/**
 * Reads an argument as a curve: the text a Curve input holds. A number is a
 * flat line at that height, and empty text one at 1, like a new curve field.
 *
 * @param args Arguments.
 * @param usage How to call the function, for the message.
 * @returns Curve.
 */
function solidScriptCurveRead(args: readonly SolidScriptValue[], usage: string): Curve {
  const text = typeof args[0] === 'string' ? args[0] : solidScriptValueText(args[0]);
  let curve = SOLID_SCRIPT_CURVES.get(text);
  if (!curve) {
    const decoded = solidScriptCurveFromText(text.trim() === '' ? '1' : text);
    if (!decoded) throw new Error(`${usage} needs a curve, such as a Curve input, not "${text.slice(0, 40)}"`);
    if (SOLID_SCRIPT_CURVES.size >= SOLID_SCRIPT_CURVE_CACHE_LIMIT) SOLID_SCRIPT_CURVES.clear();
    SOLID_SCRIPT_CURVES.set(text, (curve = decoded));
  }
  return curve;
}

/**
 * Reads an argument as a path: a list of points of one size.
 *
 * @param args Arguments.
 * @param usage How to call the function, for the message.
 * @returns Points.
 */
function solidScriptCurvePath(args: readonly SolidScriptValue[], usage: string): number[][] {
  const given = args[0];
  const list = given instanceof SolidScriptPathElement ? solidScriptPathWalk(given.path) : given;
  if (!Array.isArray(list)) throw new Error(`${usage} needs a list of points, not ${solidScriptValueText(list)}`);
  const points = list.map((entry) => solidScriptValueNumbers(entry));
  const size = points[0]?.length ?? 0;
  if (points.some((point) => !point || point.length !== size || size < 2))
    throw new Error(`${usage} needs points that all have the same number of values, such as x, y, z`);
  return points as number[][];
}

/** Functions that read Curve inputs and paths. */
export const SOLID_SCRIPT_FUNCTIONS_CURVE = {
  curve_at: solidScriptAxesEach('CurveAt(curve, x)', (args) => {
    const usage = 'CurveAt(curve, x)';
    return curveEvaluate(solidScriptCurveRead(args, usage), solidScriptExtraNumber(args, 1, usage));
  }),
  path_length: (args) => solidScriptPathLength(solidScriptCurvePath(args, 'PathLength(points)')),
  resample: (args) => {
    const usage = 'Resample(points, count)';
    const path = solidScriptCurvePath(args, usage);
    if (path.length < 2) throw new Error(`${usage} needs at least 2 points`);
    const count = Math.round(solidScriptExtraNumber(args, 1, usage));
    if (count < 2 || count > 10000) throw new Error(`${usage} needs a count from 2 to 10000, not ${count}`);
    return solidScriptPathResample(path, count);
  },
  resample_every: (args) => {
    const usage = 'ResampleEvery(points, distance)';
    const path = solidScriptCurvePath(args, usage);
    if (path.length < 2) throw new Error(`${usage} needs at least 2 points`);
    const step = solidScriptExtraNumber(args, 1, usage);
    if (!(step >= 0.01)) throw new Error(`${usage} needs a distance of at least 0.01, not ${step}`);
    if (solidScriptPathLength(path) / step > 10000) throw new Error(`${usage} would give more than 10000 points`);
    return solidScriptPathResampleEvery(path, step);
  },
  path_at: (args) => {
    const usage = 'PathAt(points, amount)';
    return solidScriptPathAt(solidScriptCurvePath(args, usage), solidScriptExtraNumber(args, 1, usage), usage);
  },
  path_direction: (args) => {
    const usage = 'PathDirection(points, amount)';
    return solidScriptPathDirection(solidScriptCurvePath(args, usage), solidScriptExtraNumber(args, 1, usage), usage);
  },
  trim_path: (args) => {
    const usage = 'TrimPath(points, start, end)';
    return solidScriptPathTrim(
      solidScriptCurvePath(args, usage),
      solidScriptExtraNumber(args, 1, usage),
      solidScriptExtraNumber(args, 2, usage),
      usage,
    );
  },
  curve_profile: (args) => {
    const usage = 'CurveProfile(curve, height, depth, side, segments)';
    const curve = solidScriptCurveRead(args, usage);
    const height = args[1] === undefined ? 1 : solidScriptExtraNumber(args, 1, usage);
    const depth = args[2] === undefined ? 0.2 : solidScriptExtraNumber(args, 2, usage);
    const side = solidScriptCurveProfileSideRead(
      args[3] === undefined ? 'Normal' : solidScriptValueText(args[3]),
      usage,
    );
    const segments = args[4] === undefined ? 16 : solidScriptExtraNumber(args, 4, usage);
    return solidScriptCurveProfilePoints(curve, height, depth, side, segments, usage);
  },
  profile_points: (args) => {
    const usage = 'ProfilePoints(curve, height, radius)';
    const curve = solidScriptCurveRead(args, usage);
    const height = solidScriptExtraNumber(args, 1, usage);
    const radius = solidScriptExtraNumber(args, 2, usage);
    return generatorRevolveStationsFromCurve(curve, height, radius, { base: 0.5, top: 0.5 }).map((station) => [
      station.height,
      station.radius,
    ]);
  },
} satisfies Readonly<Record<string, SolidScriptCurveFunction>>;
