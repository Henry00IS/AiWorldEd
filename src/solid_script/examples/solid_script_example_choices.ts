/**
 * Script words for built-in generator and modifier choice values, keyed by the
 * stored inspector value. Several stored values may share one script word, such
 * as Follow for Move With Shape and Move With Copy.
 */
export const SOLID_SCRIPT_EXAMPLE_CHOICE_WORDS: Readonly<Record<string, string>> = {
  'Along X': 'X',
  'Along Z': 'Z',
  'Counter Clockwise': 'Counterclockwise',
  'Target Rise': 'Rise',
  'Step Count': 'Count',
  'Sloped Slab': 'Slab',
  'Solid To Floor': 'Solid',
  'Floating Treads': 'Floating',
  'Voussoir Ring': 'Voussoir',
  'Wall With Opening': 'Wall',
  'Stretch To Top': 'Stretch',
  'Full Sphere': 'Sphere',
  'Move With Shape': 'Follow',
  'Move With Copy': 'Follow',
  'World Aligned': 'World',
  'Center Of Whole Input': 'Whole',
  'Center Of Each Piece': 'Each',
  'Volume Center': 'Volume',
  'Fixed Step': 'Fixed',
  'Relative To Size': 'Relative',
  'Fit Distance': 'Fit',
  'Size × Plus Step': 'Plus',
  'Whole Input': 'Whole',
  'Each Piece': 'Each',
  'On The Ring': 'Ring',
  'Around Pivot': 'Around',
  'Full Ring': 'Full',
  'Angle Step': 'Step',
  'Negative Side': 'Negative',
  'Positive Side': 'Positive',
};

/**
 * Script word for a stored inspector choice value.
 *
 * @param stored Value the built-in inspector stores, or a script word.
 * @returns Word a script writes.
 */
export function solidScriptExampleChoiceWord(stored: string): string {
  return SOLID_SCRIPT_EXAMPLE_CHOICE_WORDS[stored] ?? stored;
}
