import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import {
  solidScriptDocumentNames,
  solidScriptDocumentNamesAt,
} from '@/solid_script/document/solid_script_document_names.js';
import { solidScriptMemberNames } from '@/solid_script/language/solid_script_members.js';
import {
  solidScriptSuggestionContext,
  solidScriptSuggestions,
  type SolidScriptSuggestionScope,
} from '@/solid_script/ui/solid_script_suggestions.js';

const SCRIPT = solidScriptDocumentCreate([
  { command: 'input', values: { name: 'Steps', type: 'Count' } },
  { command: 'cube', values: { into: 'Box1', label: 'Knob' } },
  { command: 'for_each', values: { variable: 'Brush', list: '[$Input.Brushes]', key: 'K' } },
  { command: 'select_brushes' },
  { command: 'extrude_face', values: { top: 'Tops' } },
  { command: 'end' },
  { command: 'repeat', values: { variable: 'I', from: '0', to: '3' } },
  { command: 'variable', values: { name: 'Local.Size', value: '2' } },
  { command: 'end' },
  { command: 'function', values: { name: 'Area', parameters: 'W, D' } },
  { command: 'end' },
  { command: 'part', values: { name: 'Post' } },
  { command: 'end' },
]);

/**
 * Lists the suggestions for a field text with the caret at its end.
 *
 * @param text Field text.
 * @param scope What the field may refer to.
 * @returns Suggestions.
 */
function offered(text: string, scope: SolidScriptSuggestionScope) {
  return solidScriptSuggestions(solidScriptSuggestionContext(text, text.length, false), scope);
}

describe('SolidScript suggestion details', () => {
  it('lists after the dot of a For Each item the members its error message lists', () => {
    const scope = { names: solidScriptDocumentNamesAt(SCRIPT, 3), extra: [], words: [] };
    const brush = offered('[Brush.', scope).map((entry) => entry.label.slice('Brush.'.length));
    expect(brush).toEqual(['Name', 'Faces', 'Edges', 'Vertices', 'Center', 'Min', 'Max', 'Size', 'Extents', 'Data']);
    expect(brush).toEqual(solidScriptMemberNames('Brush'));
    expect(offered('[K.', scope)).toEqual([]);
  });

  it('writes every description as a sentence, with the names of blocks in bold', () => {
    const scope = { names: solidScriptDocumentNamesAt(SCRIPT, 7), extra: [], words: [] };
    const all = [...offered('[', scope), ...offered('[=', scope), ...offered('[$Selected.', scope)];
    const details = new Map(all.map((entry) => [entry.label, entry.detail]));
    expect(details.get('Box1')).toBe('Brush: What is made of **Cube** (line 2).');
    expect(details.get('Tops')).toBe('Face List: Top faces of **Extrude Face** (line 5).');
    expect(details.get('$Editor.Name')).toBe('Text: Name of the editor.');
    expect(details.get('Steps')).toBe('Number: Count input (line 1).');
    expect(details.get('I')).toBe('Number: Counter of **Repeat** (line 7).');
    const scoped = { names: solidScriptDocumentNamesAt(SCRIPT, 3), extra: [], words: [] };
    const inside = new Map(offered('[', scoped).map((entry) => [entry.label, entry.detail]));
    expect(inside.get('Brush')).toBe('Brush: Item of **For Each** (line 3).');
    expect(inside.get('K')).toBe('Number: Key of **For Each** (line 3).');
    for (const entry of [...all, ...offered('[Box1.', scope), ...offered('[Steps.', scope)]) {
      const sentence = entry.detail.replace(/^[A-Z][A-Za-z/]*(?: List)?: /, '');
      if (/^[A-Za-z]+\(.*\)( -> \w+)?$/.test(sentence)) continue;
      expect(sentence, `${entry.label}: ${entry.detail}`).toMatch(/^[^a-z].*[.?!]$/s);
    }
    expect(solidScriptDocumentNames(SCRIPT).find((entry) => entry.name === 'Knob')?.detail).toBe(
      'Name of a **Cube** line',
    );
  });
});
