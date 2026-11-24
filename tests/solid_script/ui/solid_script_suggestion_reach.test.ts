import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptDocumentNamesAt } from '@/solid_script/document/solid_script_document_names.js';
import { solidScriptSuggestionContext, solidScriptSuggestions } from '@/solid_script/ui/solid_script_suggestions.js';
import { solidScriptExplorerEntries } from '@/solid_script/ui/solid_script_editor_explorer.js';

/**
 * Tells the description autocomplete shows for a name in a field of a line.
 *
 * @param lines Script.
 * @param position 0-based line whose field is typed in.
 * @param name Name.
 * @returns Description.
 */
function detail(lines: SolidScriptLine[], position: number, name: string): string | undefined {
  const scope = { names: solidScriptDocumentNamesAt(solidScriptDocumentCreate(lines), position), extra: [], words: [] };
  return solidScriptSuggestions(solidScriptSuggestionContext('[', 1, false), scope).find(
    (entry) => entry.label === name,
  )?.detail;
}

const END: SolidScriptLine = { command: 'end' };
const set = (name: string, value: string): SolidScriptLine => ({ command: 'variable', values: { name, value } });

describe('autocomplete describes a name by the writes that reach the caret', () => {
  const henry: SolidScriptLine[] = [
    set('Width', '15'),
    { command: 'transform' },
    { command: 'cube', values: { size: '2, 2, 2', into: 'Width' } },
    { command: 'sphere', values: { r: '1.3', label: '[Width]' } },
    END,
  ];

  it('tells the Cube that wrote it, not the first Set', () => {
    expect(detail(henry, 3, 'Width')).toBe('Solid: What is made of **Cube** (line 3).');
  });

  it('does not count the Cube’s own Into before the Cube runs', () => {
    expect(detail(henry, 2, 'Width')).toBe('Number: Set to 15 (line 1).');
  });

  it('points the Variables tab at the write that reaches the end, with the same description', () => {
    const entry = solidScriptExplorerEntries(solidScriptDocumentCreate(henry), [], []).find(
      (item) => item.name === 'Width',
    );
    expect(entry?.lines).toEqual([0, 2]);
    expect(entry?.reachLines).toEqual([2]);
    expect(entry?.type).toBe('Solid');
    expect(entry?.reaches).toBe('Solid: What is made of **Cube** (line 3).');
  });

  it('lists every write an If and its Else may leave, each with its kinds', () => {
    const lines = [
      set('Flag', 'yes'),
      { command: 'if', values: { condition: '[Flag]' } },
      set('W', '15'),
      { command: 'else' },
      { command: 'cube', values: { into: 'W' } },
      END,
      { command: 'echo', values: { value: '[W]' } },
    ];
    expect(detail(lines, 6, 'W')).toBe('Number: Set to 15 (line 3). Solid: What is made of **Cube** (line 5).');
  });

  it('lists the write before a loop and the one inside it', () => {
    const lines = [
      set('V', 'oak'),
      { command: 'repeat', values: { variable: 'I' } },
      { command: 'echo' },
      set('V', '1'),
      END,
    ];
    expect(detail(lines, 2, 'V')).toBe('Text: Set to oak (line 1). Number: Set to 1 (line 4).');
  });

  it('tells a Function input by the Calls that pass it', () => {
    const lines = [
      { command: 'function', values: { name: 'Post', parameters: 'X' } },
      { command: 'echo', values: { value: '[$Local.X]' } },
      END,
      { command: 'call', values: { name: 'Post', values: '1' } },
      { command: 'call', values: { name: 'Post', values: 'oak' } },
    ];
    expect(detail(lines, 1, '$Local.X')).toBe(
      'Number: Passed in by **Call** (line 4). Text: Passed in by **Call** (line 5).',
    );
  });

  it('tells a Call result by the Call', () => {
    const lines = [
      { command: 'function', values: { name: 'Two', parameters: '' } },
      { command: 'return', values: { value: '2' } },
      END,
      { command: 'call', values: { name: 'Two', result: 'R' } },
      { command: 'echo' },
    ];
    expect(detail(lines, 4, 'R')).toBe('Number: Returned by Two() (line 4).');
  });
});
