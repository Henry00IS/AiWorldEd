import { curveDecode } from '@/curve/model/curve_codec.js';
import { curveFromPolyline, type Curve } from '@/curve/model/curve_model.js';
import { curveEvaluate } from '@/curve/model/curve_sample.js';
import { generatorRevolveStationsFromCurve } from '@/generator/revolve/generator_revolve_curve.js';
import { solidScriptExtraNumber } from './solid_script_functions_extra.js';
import { solidScriptValueText, type SolidScriptValue } from './solid_script_value.js';

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
    const height = text.trim() === '' ? 1 : Number(text);
    const decoded = Number.isFinite(height)
      ? curveFromPolyline([
          [0, height],
          [1, height],
        ])
      : curveDecode(text);
    if (!decoded) throw new Error(`${usage} needs a curve, such as a Curve input, not "${text.slice(0, 40)}"`);
    if (SOLID_SCRIPT_CURVES.size >= SOLID_SCRIPT_CURVE_CACHE_LIMIT) SOLID_SCRIPT_CURVES.clear();
    SOLID_SCRIPT_CURVES.set(text, (curve = decoded));
  }
  return curve;
}

/** Functions that read Curve inputs. */
export const SOLID_SCRIPT_FUNCTIONS_CURVE: Readonly<Record<string, SolidScriptCurveFunction>> = {
  curve_at: (args) => {
    const usage = 'curve_at(curve, x)';
    return curveEvaluate(solidScriptCurveRead(args, usage), solidScriptExtraNumber(args, 1, usage));
  },
  profile_points: (args) => {
    const usage = 'profile_points(curve, height, radius)';
    const curve = solidScriptCurveRead(args, usage);
    const height = solidScriptExtraNumber(args, 1, usage);
    const radius = solidScriptExtraNumber(args, 2, usage);
    return generatorRevolveStationsFromCurve(curve, height, radius, { base: 0.5, top: 0.5 }).map((station) => [
      station.height,
      station.radius,
    ]);
  },
};
