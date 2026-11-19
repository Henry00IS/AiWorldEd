import type { ModifierStackField } from '@/modifier/stack/modifier_stack_types.js';

/** Script word and description of a generator choice. */
export interface SolidScriptGeneratorChoiceWord {
  /** Word a script writes, in Title Case. */
  readonly word: string;
  /**
   * What the word does, with an example when the word is short for a longer
   * idea.
   */
  readonly detail: string;
}

/**
 * Script words for generator choices, keyed by field then by the stored value
 * of the box generator. The box generator keeps those stored values; only the
 * script spelling changes.
 */
export const SOLID_SCRIPT_GENERATOR_CHOICE_WORDS: Readonly<
  Record<string, Readonly<Record<string, SolidScriptGeneratorChoiceWord>>>
> = {
  axis: {
    'Along Z': {
      word: 'Z',
      detail: 'The prism runs along Z, toward the front. Example: Axis Z, Size 2, 2, 4.',
    },
    'Along X': {
      word: 'X',
      detail: 'The prism runs along X, left to right. Example: Axis X, Size 4, 2, 2.',
    },
    Upright: {
      word: 'Upright',
      detail: 'The prism stands on Y, the up axis. Example: Axis Upright for a vertical column.',
    },
  },
  direction: {
    'Counter Clockwise': {
      word: 'Counterclockwise',
      detail: 'Steps climb while turning left, as seen from above. Example: Direction Counterclockwise, Sweep 270.',
    },
    Clockwise: {
      word: 'Clockwise',
      detail: 'Steps climb while turning right, as seen from above. Example: Direction Clockwise, Sweep 270.',
    },
  },
  sizing: {
    'Target Rise': {
      word: 'Rise',
      detail:
        'The number of steps comes from the box height and the target rise. Example: Steps By Rise, Target Rise 0.125.',
    },
    'Step Count': {
      word: 'Count',
      detail: 'The stairs use the given number of steps, filling the box height. Example: Steps By Count, Steps 8.',
    },
  },
  fill: {
    'Sloped Slab': {
      word: 'Slab',
      detail: 'A sloped slab sits under the treads, like a stringer. Example: Underside Slab.',
    },
    'Solid To Floor': {
      word: 'Solid',
      detail: 'The stairs fill solid down to the floor under each tread. Example: Underside Solid.',
    },
    'Floating Treads': {
      word: 'Floating',
      detail: 'Only the treads are built, with open air under them. Example: Underside Floating, Tread Depth 0.05.',
    },
  },
  style: {
    'Voussoir Ring': {
      word: 'Voussoir',
      detail: 'A ring of wedge-shaped stones makes the arch. Example: Style Voussoir, Span Along X.',
    },
    'Wall With Opening': {
      word: 'Wall',
      detail:
        'A wall fills the box, with an arched opening through it. Example: Style Wall, set Mode Subtractive to cut a doorway.',
    },
    Tunnel: {
      word: 'Tunnel',
      detail:
        'The arched opening fills the box; set Mode Subtractive to cut it through what is there. Example: Style Tunnel.',
    },
  },
  span: {
    'Along X': {
      word: 'X',
      detail:
        "The arch spans across the box's X axis, left to right; Z is its depth. Example: Span Along X, Size 4, 2, 1.",
    },
    'Along Z': {
      word: 'Z',
      detail:
        "The arch spans across the box's Z axis, front to back; X is its depth. Example: Span Along Z, Size 1, 2, 4.",
    },
  },
  shape: {
    Round: {
      word: 'Round',
      detail: 'A half circle, flattened only when the box is too low for it. Example: Shape Round.',
    },
    'Stretch To Top': {
      word: 'Stretch',
      detail: 'An ellipse that reaches the top of the box. Example: Shape Stretch in a tall box.',
    },
  },
};

/**
 * Script word for a generator choice when no script spelling is declared: the
 * inspector label when that label is only the Center spelling of the stored
 * value, otherwise the stored value.
 *
 * @param choice Inspector choice.
 * @returns Word a script writes.
 */
export function solidScriptGeneratorChoiceFallback(choice: { value: string; label: string }): string {
  return choice.label === choice.value.replaceAll('Centre', 'Center') ? choice.label : choice.value;
}

/**
 * Script word and description of a generator choice.
 *
 * @param field Generator field.
 * @param choice Inspector choice, with its stored value.
 * @returns Word a script writes, and its description.
 */
export function solidScriptGeneratorChoiceScript(
  field: ModifierStackField,
  choice: { value: string; label: string },
): SolidScriptGeneratorChoiceWord {
  return (
    SOLID_SCRIPT_GENERATOR_CHOICE_WORDS[field.key]?.[choice.value] ?? {
      word: solidScriptGeneratorChoiceFallback(choice),
      detail: choice.label,
    }
  );
}

/**
 * Stored box-generator value of a script choice word, when they differ.
 *
 * @param key Field key.
 * @param word Script word.
 * @returns Stored value, or the word when the generator uses the same text.
 */
export function solidScriptGeneratorChoiceStoredOf(key: string, word: string): string {
  const named = SOLID_SCRIPT_GENERATOR_CHOICE_WORDS[key];
  const found = named ? Object.entries(named).find(([, entry]) => entry.word === word) : undefined;
  return found ? found[0] : word;
}
