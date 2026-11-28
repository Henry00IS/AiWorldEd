import { solidScriptParameter, solidScriptParameterInto } from './solid_script_command_parameters.js';
import { solidScriptFaceWriteValue } from './solid_script_face_of.js';
import type { Curve } from '@/curve/model/curve_model.js';
import { solidScriptCurveOf } from '@/solid_script/language/solid_script_curve_of.js';
import { SolidScriptCurveValue } from '@/solid_script/language/solid_script_curve_value.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import { solidScriptValueNumbers } from '@/solid_script/language/solid_script_value.js';

/** Kinds a Curve field takes. */
const SOLID_SCRIPT_CURVE_FIELD_ACCEPTS = ['Curve', 'Text', 'Number', 'Vector List'] as const;

/**
 * Reads a Curve field.
 *
 * @param run Running line.
 * @param label Command, for messages.
 * @param key Key of the field.
 * @param field Caption of the field, for messages.
 * @returns Curve, never to be changed.
 */
export function solidScriptCurveSource(run: SolidScriptBlockRun, label: string, key = 'curve', field = 'Curve'): Curve {
  const curve = solidScriptCurveOf(run.value(key));
  if (!curve) throw new Error(`${label} needs a Curve in ${field}, such as [Profile]`);
  return curve;
}

/**
 * Reads a field of two numbers: a place on the curve square, x then height.
 *
 * @param run Running line.
 * @param label Command, for messages.
 * @param key Key of the field.
 * @param field Caption of the field, for messages.
 * @returns X and height.
 */
export function solidScriptCurvePlace(
  run: SolidScriptBlockRun,
  label: string,
  key: string,
  field: string,
): [number, number] {
  const numbers = solidScriptValueNumbers(run.value(key));
  if (numbers?.length !== 2 || numbers.some((number) => !Number.isFinite(number)))
    throw new Error(`${label} needs two numbers in ${field}, x then height, such as 0.5, 1`);
  return [numbers[0] as number, numbers[1] as number];
}

/**
 * Writes a changed curve to Into.
 *
 * @param run Running line.
 * @param curve Curve.
 */
export function solidScriptCurveWrite(run: SolidScriptBlockRun, curve: Curve): void {
  solidScriptFaceWriteValue(run, 'into', new SolidScriptCurveValue(curve));
}

/**
 * The Into field of the blocks that write a Curve.
 *
 * @returns Field.
 */
export function solidScriptCurveIntoField() {
  return {
    ...solidScriptParameterInto('the curve, a Curve', 'Curve', 'what is made', 'label'),
    hint: 'Variable to write the curve to, such as Ramp.',
    optional: false,
    default: 'Curve',
  };
}

/**
 * A field that takes a Curve.
 *
 * @param key Key of the stored value.
 * @param label Visible caption.
 * @param hint Hover text.
 * @returns Field.
 */
export function solidScriptCurveField(key: string, label: string, hint: string) {
  return {
    ...solidScriptParameter(key, label, 'message', '[0, 0], [1, 1]', hint),
    accepts: SOLID_SCRIPT_CURVE_FIELD_ACCEPTS,
  };
}
