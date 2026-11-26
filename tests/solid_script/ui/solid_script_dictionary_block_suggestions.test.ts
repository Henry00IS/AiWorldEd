import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptDocumentNamesAt } from '@/solid_script/document/solid_script_document_names.js';
import { solidScriptDocumentNamesUnknown } from '@/solid_script/document/solid_script_document_names.js';
import {
  solidScriptSuggestionContext,
  solidScriptSuggestions,
  type SolidScriptSuggestionScope,
} from '@/solid_script/ui/solid_script_suggestions.js';

/**
 * Makes a line.
 *
 * @param command Command id.
 * @param values Field values.
 * @returns Line.
 */
function line(command: string, values: Record<string, string> = {}): SolidScriptLine {
  return { command, values };
}

const SCRIPT = solidScriptDocumentCreate([
  line('add_entry', { key: 'Wood', value: '5', dictionary: 'Prices' }),
  line('add_entry', { key: 'Stone', value: '7', dictionary: 'Prices' }),
  line('add_entry', { key: 'Glass', value: '1', dictionary: 'Extra' }),
  line('merge_dictionary', { from: '[Extra]', dictionary: 'Prices' }),
  line('add_entry', { key: 'Wood', value: '6', dictionary: 'prices' }),
  line('remove_entry', { key: 'Stone', dictionary: 'Prices' }),
  line('clear_variable', { name: 'Extra' }),
  line('variable', { name: 'K', value: 'Oak' }),
  line('add_entry', { key: '[K]', value: '1', dictionary: 'Later' }),
  line('echo', { value: '' }),
]);

/**
 * Finds the name a script has at a line.
 *
 * @param name Name to find.
 * @param at 0-based line.
 * @returns The name, or undefined.
 */
function nameAt(name: string, at: number) {
  return solidScriptDocumentNamesAt(SCRIPT, at).find((entry) => entry.name.toLowerCase() === name.toLowerCase());
}

/**
 * Lists the labels suggested for a field text with the caret at its end.
 *
 * @param text Field text.
 * @param at 0-based line the field is on.
 * @returns Labels.
 */
function offered(text: string, at: number): string[] {
  const scope: SolidScriptSuggestionScope = { names: solidScriptDocumentNamesAt(SCRIPT, at), extra: [], words: [] };
  return solidScriptSuggestions(solidScriptSuggestionContext(text, text.length, false), scope).map(
    (entry) => entry.label,
  );
}

describe('Dictionary block names', () => {
  it('knows a name Add Entry makes is a Dictionary, and the keys it got', () => {
    expect(nameAt('Prices', 2)?.kinds).toEqual(['Dictionary']);
    expect(nameAt('Prices', 2)?.keys).toEqual(['Wood', 'Stone']);
    expect(nameAt('Prices', 3)?.keys).toEqual(['Wood', 'Stone']);
  });

  it('adds the keys of the Dictionary Merge Dictionary takes from, in any case of the name', () => {
    expect(nameAt('Extra', 3)?.keys).toEqual(['Glass']);
    expect(nameAt('Prices', 4)?.keys).toEqual(['Wood', 'Stone', 'Glass']);
    expect(nameAt('Prices', 5)?.keys).toEqual(['Wood', 'Stone', 'Glass']);
  });

  it('forgets the keys when Clear Variable empties it, and stays a Dictionary', () => {
    expect(nameAt('Extra', 7)?.kinds).toEqual(['Dictionary']);
    expect(nameAt('Extra', 7)?.keys).toBeUndefined();
  });

  it('knows a name no key is typed for is a Dictionary without keys', () => {
    expect(nameAt('Later', 9)?.kinds).toEqual(['Dictionary']);
    expect(nameAt('Later', 9)?.keys).toBeUndefined();
  });

  it('suggests the keys the blocks added', () => {
    expect(offered('[Prices.Data.', 4)).toEqual(['Prices.Data.Wood', 'Prices.Data.Stone', 'Prices.Data.Glass']);
    expect(offered('[Prices.', 8)).toEqual(['Prices.Data', 'Prices.Wood', 'Prices.Stone', 'Prices.Glass']);
  });

  it('offers the Dictionary names in the name fields of the blocks', () => {
    expect(offered('[Pri', 4)).toContain('Prices');
  });

  it('squiggles no name of a Dictionary the blocks made', () => {
    expect(solidScriptDocumentNamesUnknown(SCRIPT).size).toBe(0);
  });
});
