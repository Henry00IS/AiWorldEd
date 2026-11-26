import type { Curve } from '@/curve/model/curve_model.js';
import { solidScriptCurveFromText } from './solid_script_curve_read.js';
import { SolidScriptCurveValue } from './solid_script_curve_value.js';
import { solidScriptValueText, type SolidScriptValue } from './solid_script_value.js';

/**
 * Reads a value as a curve: a Curve, a number for a flat line, a preset name
 * such as "Classic Column", or points in brackets such as "[0, 1], [1, 0]".
 *
 * @param value Value.
 * @returns The curve, shared and not to be changed, or null when the value is
 *   no curve.
 */
export function solidScriptCurveOf(value: SolidScriptValue): Curve | null {
  if (value instanceof SolidScriptCurveValue) return value.curve;
  return solidScriptCurveFromText(typeof value === 'string' ? value : solidScriptValueText(value));
}

/**
 * Reads a value as a curve, an empty one as a flat line at 1 like a new curve
 * field.
 *
 * @param value Value.
 * @returns Curve, or null when the value is no curve.
 */
export function solidScriptCurveOrFlat(value: SolidScriptValue): Curve | null {
  if (value === undefined || (typeof value === 'string' && value.trim() === '')) return solidScriptCurveOf('1');
  return solidScriptCurveOf(value);
}
