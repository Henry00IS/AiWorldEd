import type { SolidScriptCommandParameter, SolidScriptCommandParameterType } from './solid_script_command.js';
import { SOLID_SCRIPT_RINGS, SOLID_SCRIPT_SIDES } from '@/solid_script/language/solid_script_primitives.js';

/**
 * Describes one field of a command.
 *
 * @param key Key of the stored value.
 * @param label Visible caption.
 * @param type Editor the configurator shows.
 * @param fallback Value of a new line.
 * @param hint Hover text.
 * @returns Field.
 */
export function solidScriptParameter(
  key: string,
  label: string,
  type: SolidScriptCommandParameterType,
  fallback: string,
  hint: string,
): SolidScriptCommandParameter {
  return { key, label, type, default: fallback, hint };
}

/**
 * The Center switch of shapes that start at the origin.
 *
 * @returns Field.
 */
export function solidScriptParameterCenter(): SolidScriptCommandParameter {
  return solidScriptParameter(
    'center',
    'Center',
    'boolean',
    'true',
    'Yes: the shape sits centred on the origin, the centre of the generator. No: its corner sits on the origin and it grows along X, Y and Z.',
  );
}

/**
 * The Sides field of round shapes, named and limited like the primitive
 * generators.
 *
 * @returns Field.
 */
export function solidScriptParameterSides(): SolidScriptCommandParameter {
  return solidScriptParameter(
    'sides',
    'Sides',
    'count',
    String(SOLID_SCRIPT_SIDES.default),
    `Faces around the axis, ${SOLID_SCRIPT_SIDES.min} to ${SOLID_SCRIPT_SIDES.max}. More sides look rounder and cost more polygons.`,
  );
}

/**
 * The Rings field of a sphere, named and limited like the sphere generator.
 *
 * @returns Field.
 */
export function solidScriptParameterRings(): SolidScriptCommandParameter {
  return solidScriptParameter(
    'rings',
    'Rings',
    'count',
    String(SOLID_SCRIPT_RINGS.default),
    `Bands from the bottom to the top, ${SOLID_SCRIPT_RINGS.min} to ${SOLID_SCRIPT_RINGS.max}. More rings look rounder and cost more polygons.`,
  );
}
