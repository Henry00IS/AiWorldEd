import type { SolidScriptCommandWord } from './solid_script_command.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';

/** Colour names a widget's Color field offers, with the colour each draws. */
const SOLID_SCRIPT_WIDGET_COLORS: Readonly<Record<string, string>> = {
  orange: '#ff8c1a',
  red: '#e0453a',
  yellow: '#f2c230',
  green: '#4cbf5a',
  blue: '#3d8fd6',
  purple: '#9a62d6',
  pink: '#e86bb0',
  white: '#ffffff',
  gray: '#9a9a9a',
};

/** Hex colour as typed: #rgb or #rrggbb. */
const SOLID_SCRIPT_WIDGET_COLOR_HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Words the Color field of a widget offers while typing. */
export const SOLID_SCRIPT_WIDGET_COLOR_WORDS: readonly SolidScriptCommandWord[] = Object.entries(
  SOLID_SCRIPT_WIDGET_COLORS,
).map(([name, hex]) => ({ word: name[0]!.toUpperCase() + name.slice(1), detail: `Draws the handle in ${hex}` }));

/**
 * Reads the Color field of a widget line as a CSS colour.
 *
 * @param run The running line.
 * @returns Lower-case hex colour, or empty text when the field is left off.
 */
export function solidScriptWidgetColor(run: SolidScriptBlockRun): string {
  const text = run.text('color').trim().toLowerCase();
  if (text === '') return '';
  const named = SOLID_SCRIPT_WIDGET_COLORS[text];
  if (named !== undefined) return named;
  if (SOLID_SCRIPT_WIDGET_COLOR_HEX.test(text)) return text;
  throw run.fields().error('color', 'needs a colour such as Orange or #ff8800', run.text('color').trim());
}
