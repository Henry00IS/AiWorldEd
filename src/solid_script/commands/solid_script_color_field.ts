import type { SolidScriptCommandParameter } from './solid_script_command.js';
import { solidScriptParameterOptional } from './solid_script_command_parameters.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import { SOLID_SCRIPT_COLOR_WORDS, solidScriptColorResolve } from '@/solid_script/language/solid_script_color.js';

/**
 * Describes an optional Color field: the window shows a colour picker beside
 * the text, which takes a colour name, a hex colour or a [variable].
 *
 * @param hint Hover text, saying what the colour paints and what it is left
 *   off.
 * @returns Field.
 */
export function solidScriptParameterColor(hint: string): SolidScriptCommandParameter {
  return {
    ...solidScriptParameterOptional('color', 'Color', 'text', hint),
    words: SOLID_SCRIPT_COLOR_WORDS,
    color: true,
  };
}

/**
 * Reads the Color field of a running line as a CSS colour.
 *
 * @param run The running line.
 * @returns Lower-case #rrggbb, or empty text when the field is left off.
 */
export function solidScriptColorRead(run: SolidScriptBlockRun): string {
  const text = run.text('color').trim();
  if (text === '') return '';
  const color = solidScriptColorResolve(text);
  if (color === null) throw run.fields().error('color', 'needs a colour such as Orange or #ff8800', text);
  return color;
}
