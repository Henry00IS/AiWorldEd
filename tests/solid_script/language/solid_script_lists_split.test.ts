import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptDocumentNamesAt } from '@/solid_script/document/solid_script_document_names.js';
import { solidScriptFieldTokens } from '@/solid_script/language/solid_script_field_tokens.js';
import { solidScriptSuggestionContext, solidScriptSuggestions } from '@/solid_script/ui/solid_script_suggestions.js';

const line = (command: string, values: Record<string, string> = {}): SolidScriptLine => ({ command, values });
const set = (name: string, value: string, type = ''): SolidScriptLine =>
  line('variable', type === '' ? { name, value } : { name, value, type });
const echo = (value: string): SolidScriptLine => line('echo', { value });
const each = (list: string): SolidScriptLine => line('for_each', { variable: 'Item', list });
const CUBE = line('cube', { size: '2, 2, 2' });

/** What a run printed, or the error it stopped with. */
function outcome(...lines: SolidScriptLine[]): string[] {
  const result = solidScriptProgramRun(solidScriptDocumentCreate([...lines, CUBE]), {});
  return result.error ? [result.error.message] : result.messages;
}

describe('SolidScript lists split after their brackets are read', () => {
  it('writes a comma inside an item as $,', () => {
    expect(outcome(set('A', 'a$, b, c', 'Text List'), echo('[A.Count]|[A.First]|[A.Last]'))).toEqual(['2|a, b|c']);
    expect(outcome(set('T', 'x$, y'), echo('[T]'))).toEqual(['x, y']);
    const text = 'a$, b';
    expect(solidScriptFieldTokens(text).map((token) => text.slice(token.from, token.to))).toEqual(['a$, b']);
  });

  it('splits the text a bracket gives at its commas, so For Each walks every item', () => {
    const hello = set('Text', 'Hello, World', 'Text');
    expect(outcome(hello, each('[Text],23'), echo('[Item]'), line('end'))).toEqual(['Hello', 'World', '23']);
    expect(outcome(hello, each('[Text.Words]'), echo('[Item]'), line('end'))).toEqual(['Hello,', 'World']);
    expect(outcome(set('L', '1, 2, 3', 'List'), each('[L]'), echo('[Item]'), line('end'))).toEqual(['1', '2', '3']);
    expect(outcome(hello, set('A', '[Text],23', 'List'), echo('[A.Count]'))).toEqual(['3']);
  });

  it('suggests after the dot of a For Each item the members of what its list holds', () => {
    const script = solidScriptDocumentCreate([
      set('Text', 'Hello, World', 'Text'),
      each('[Text.Words]'),
      echo('[Item]'),
      line('end'),
    ]);
    const scope = { names: solidScriptDocumentNamesAt(script, 2), extra: [], words: [] };
    const labels = solidScriptSuggestions(solidScriptSuggestionContext('[Item.', 6, false), scope).map(
      (entry) => entry.label,
    );
    expect(labels).toEqual(['Item.Length', 'Item.Words']);
  });
});
