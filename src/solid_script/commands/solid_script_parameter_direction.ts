import type { SolidScriptCommandParameter } from './solid_script_command.js';

/** Words a field's label uses when it takes a direction. */
const SOLID_SCRIPT_PARAMETER_DIRECTION_WORDS = /\b(normal|direction|directions|axis)\b/i;

/**
 * Tells whether a field takes a direction, such as a Normal, a Direction or an
 * Axis: a vector or points field whose label says so.
 *
 * @param parameter Field.
 * @returns True when it takes a direction.
 */
export function solidScriptParameterTakesDirection(parameter: SolidScriptCommandParameter): boolean {
  return (
    (parameter.type === 'vector3' || parameter.type === 'points3') &&
    SOLID_SCRIPT_PARAMETER_DIRECTION_WORDS.test(parameter.label)
  );
}
