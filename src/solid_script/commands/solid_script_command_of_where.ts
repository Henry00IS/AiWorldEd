import type { SolidScriptCommandParameter } from './solid_script_command.js';
import { solidScriptParameterEach, type SolidScriptCommandEach } from './solid_script_command_each.js';
import { solidScriptParameterOptional } from './solid_script_command_parameters.js';

/**
 * The Where field of a line with an Of: a 🔁 condition each item of Of, or of
 * the selection an empty Of uses, must pass for the line to work on it.
 *
 * @param each Kind of item the field reads, such as Object.
 * @param example A condition for the hint, such as [=[$Y] > 0].
 * @returns Field.
 */
export function solidScriptParameterOfWhere(
  each: SolidScriptCommandEach,
  example: string,
): SolidScriptCommandParameter {
  return solidScriptParameterEach(
    solidScriptParameterOptional(
      'where',
      'Where',
      'value',
      `A condition each item of Of must pass for this line to work on it, such as ${example}. Left off works on every one.`,
    ),
    each,
  );
}
