import { describe, expect, it } from 'vitest';
import { solidScriptCommands } from '@/solid_script/commands/solid_script_command_catalog.js';
import { solidScriptGeneratorChoiceStoredOf } from '@/solid_script/commands/solid_script_generator_choices.js';

/** One word, or a hyphenated word such as Pass-Through. */
const SOLID_SCRIPT_CHOICE_WORD = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/;

/** Anchor tuples such as Center, Bottom, Center or Left, Front. */
const SOLID_SCRIPT_CHOICE_ANCHOR = /^[A-Za-z]+(?:, [A-Za-z]+)+$/;

/**
 * Words of a field label, folded, for the repeat check.
 *
 * @param label Field caption.
 * @returns Words.
 */
function solidScriptChoiceLabelWords(label: string): string[] {
  return label
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());
}

describe('SolidScript choice words', () => {
  it('keeps every listed choice as one word, except official anchor tuples', () => {
    const problems: string[] = [];
    for (const command of solidScriptCommands) {
      for (const parameter of command.parameters) {
        for (const entry of parameter.words ?? []) {
          const allowed = parameter.anchor !== undefined && SOLID_SCRIPT_CHOICE_ANCHOR.test(entry.word);
          if (!allowed && !SOLID_SCRIPT_CHOICE_WORD.test(entry.word))
            problems.push(`${command.id} ${parameter.label}: ${entry.word}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('does not repeat a word from the field label in a listed choice', () => {
    const problems: string[] = [];
    for (const command of solidScriptCommands) {
      for (const parameter of command.parameters) {
        const labels = new Set(solidScriptChoiceLabelWords(parameter.label));
        for (const entry of parameter.words ?? []) {
          const parts = entry.word.split(/[\s,-]+/).filter(Boolean);
          if (parts.some((part) => labels.has(part.toLowerCase())))
            problems.push(`${command.id} ${parameter.label}: ${entry.word}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('maps a script generator choice back to the stored box-generator value', () => {
    expect(solidScriptGeneratorChoiceStoredOf('span', 'X')).toBe('Along X');
    expect(solidScriptGeneratorChoiceStoredOf('span', 'Z')).toBe('Along Z');
    expect(solidScriptGeneratorChoiceStoredOf('axis', 'Upright')).toBe('Upright');
    expect(solidScriptGeneratorChoiceStoredOf('style', 'Wall')).toBe('Wall With Opening');
    expect(solidScriptGeneratorChoiceStoredOf('sides', '8')).toBe('8');
  });
});
