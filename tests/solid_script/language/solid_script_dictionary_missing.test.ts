import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDictionaryMissingText } from '@/solid_script/language/solid_script_dictionary_missing.js';
import { SolidScriptDictionary } from '@/solid_script/language/solid_script_value.js';

const PRICES: SolidScriptLine[] = [
  { command: 'add_entry', values: { key: 'Wood', value: '5', dictionary: 'Prices' } },
  { command: 'add_entry', values: { key: 'Stone', value: '7', dictionary: 'Prices' } },
];

/**
 * Runs script lines.
 *
 * @param lines Lines.
 * @returns Run result.
 */
function run(...lines: SolidScriptLine[]) {
  return solidScriptProgramRun(solidScriptDocumentCreate(lines));
}

/**
 * Makes an Echo line.
 *
 * @param value Message.
 * @returns Line.
 */
function echo(value: string): SolidScriptLine {
  return { command: 'echo', values: { value } };
}

/**
 * Returns the warnings of a run tied to a line.
 *
 * @param result Run result.
 * @returns Warning texts.
 */
function lineWarnings(result: ReturnType<typeof run>): string[] {
  return result.warnings.filter((warning) => warning.line !== null).map((warning) => warning.text);
}

describe('SolidScript missing Dictionary keys', () => {
  it('reads a missing key as empty text and warns on that line with the keys it has', () => {
    const result = run(...PRICES, echo('[Prices.Wod]'));
    expect(result.error).toBeNull();
    expect(result.messages).toEqual(['']);
    expect(result.warnings).toContainEqual({
      line: 3,
      text: 'There is no key "Wod" in the Dictionary, so it reads as empty text; it has Wood, Stone.',
    });
  });

  it('does not warn for a key it has, or for Contains', () => {
    const result = run(...PRICES, echo('[Prices.Wood]'), echo('[=Contains([Prices], "Wod")]'));
    expect(result.messages).toEqual(['5', 'No']);
    expect(lineWarnings(result)).toEqual([]);
  });

  it('says when a Dictionary has no keys yet', () => {
    const result = run({ command: 'make_dictionary', values: { into: 'Empty' } }, echo('[Empty.Wood]'));
    expect(lineWarnings(result)).toEqual([
      'There is no key "Wood" in the Dictionary, so it reads as empty text; it has no keys yet.',
    ]);
  });

  it('does not warn for a .Data value never set on geometry', () => {
    const result = run({ command: 'cube', values: { into: 'Box' } }, echo('[Box.Data.Height]'));
    expect(result.messages).toEqual(['']);
    expect(lineWarnings(result)).toEqual([]);
  });

  it('counts the keys instead of listing them when there are many', () => {
    const many = new SolidScriptDictionary(
      new Map(Array.from({ length: 12 }, (_, index) => [`k${index}`, { name: `K${index}`, value: index }])),
    );
    expect(solidScriptDictionaryMissingText(many, 'Wood')).toBe(
      'There is no key "Wood" in the Dictionary, so it reads as empty text; it has 12 keys.',
    );
  });
});
