/** Colour names a Color field offers, with the colour each stands for. */
const SOLID_SCRIPT_COLOR_NAMES: Readonly<Record<string, string>> = {
  orange: '#ff8c1a',
  red: '#e0453a',
  yellow: '#f2c230',
  green: '#4cbf5a',
  cyan: '#3ac8d0',
  blue: '#3d8fd6',
  purple: '#9a62d6',
  pink: '#e86bb0',
  white: '#ffffff',
  gray: '#9a9a9a',
  black: '#1a1a1a',
};

/** Hex colour as typed: #rgb or #rrggbb. */
const SOLID_SCRIPT_COLOR_HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Words a Color field offers while typing, each a colour name. */
export const SOLID_SCRIPT_COLOR_WORDS: readonly { word: string; detail: string }[] = Object.entries(
  SOLID_SCRIPT_COLOR_NAMES,
).map(([name, hex]) => ({ word: name.charAt(0).toUpperCase() + name.slice(1), detail: hex }));

/**
 * Reads a colour written as a name such as Orange or a hex colour such as
 * #ff8800 or #f80.
 *
 * @param text Colour as written.
 * @returns Lower-case #rrggbb, or null when the text is no colour.
 */
export function solidScriptColorResolve(text: string): string | null {
  const typed = text.trim().toLowerCase();
  const named = SOLID_SCRIPT_COLOR_NAMES[typed];
  if (named !== undefined) return named;
  if (!SOLID_SCRIPT_COLOR_HEX.test(typed)) return null;
  return typed.length === 4 ? `#${[...typed.slice(1)].map((digit) => digit + digit).join('')}` : typed;
}
