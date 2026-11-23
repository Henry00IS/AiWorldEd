import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptDocumentNamesAt } from '@/solid_script/document/solid_script_document_names.js';
import {
  solidScriptSuggestionContext,
  solidScriptSuggestions,
  type SolidScriptSuggestionScope,
} from '@/solid_script/ui/solid_script_suggestions.js';

const SCRIPT = solidScriptDocumentCreate([
  { command: 'make_dictionary', values: { into: 'Prices', keys: 'Wood, Stone', values: '5, 7' } },
  { command: 'variable', values: { name: 'Prices.Data.Glass', value: '12' } },
  { command: 'variable', values: { name: 'D', value: '[=Dictionary(List("a", "b"), List(1, 2))]' } },
  { command: 'variable', values: { name: 'Copy', value: '[Prices]' } },
  { command: 'cube', values: { into: 'Box' } },
  { command: 'variable', values: { name: 'Box.Data.Heat', value: '4' } },
  { command: 'echo', values: { value: '' } },
]);

/**
 * Lists the labels suggested for a field text with the caret at its end.
 *
 * @param text Field text.
 * @param line 0-based line the field is on.
 * @param path True for a field that names a path a Set writes.
 * @returns Labels.
 */
function offered(text: string, line: number, path = false): string[] {
  const scope: SolidScriptSuggestionScope = {
    names: solidScriptDocumentNamesAt(SCRIPT, line),
    extra: [],
    words: [],
    ...(path ? { paths: true } : {}),
  };
  return solidScriptSuggestions(solidScriptSuggestionContext(text, text.length, path), scope).map(
    (entry) => entry.label,
  );
}

describe('Dictionary key suggestions', () => {
  it('suggests the keys a Dictionary got so far, and its Data', () => {
    expect(offered('[Prices.', 6)).toEqual(['Prices.Data', 'Prices.Wood', 'Prices.Stone', 'Prices.Glass']);
    expect(offered('[Prices.Data.', 6)).toEqual(['Prices.Data.Wood', 'Prices.Data.Stone', 'Prices.Data.Glass']);
    expect(offered('[Prices.', 1)).toEqual(['Prices.Data', 'Prices.Wood', 'Prices.Stone']);
  });

  it('knows the keys of the Dictionary function and of a copy', () => {
    expect(offered('[D.', 6)).toEqual(['D.Data', 'D.a', 'D.b']);
    expect(offered('[Copy.Data.', 6)).toEqual(['Copy.Data.Wood', 'Copy.Data.Stone', 'Copy.Data.Glass']);
  });

  it('suggests the keys written under the .Data of geometry', () => {
    expect(offered('[Box.Data.', 6)).toEqual(['Box.Data.Heat']);
    expect(offered('[Box.Data.H', 6)).toEqual(['Box.Data.Heat']);
  });

  it('offers Data and then the keys where a Set writes', () => {
    expect(offered('Prices.', 6, true)).toEqual(['Prices.Data']);
    expect(offered('Prices.Data.', 6, true)).toEqual(['Prices.Data.Wood', 'Prices.Data.Stone', 'Prices.Data.Glass']);
  });
});
