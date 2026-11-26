import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptDocumentNames } from '@/solid_script/document/solid_script_document_names.js';
import { SOLID_SCRIPT_FUNCTIONS_BUILTIN } from '@/solid_script/language/solid_script_functions_builtin.js';
import { solidScriptFunctionSpelling } from '@/solid_script/language/solid_script_name_key.js';
import {
  solidScriptSuggestionContext,
  solidScriptSuggestions,
  type SolidScriptSuggestionScope,
} from '@/solid_script/ui/solid_script_suggestions.js';

const SCRIPT = solidScriptDocumentCreate([
  { command: 'variable', values: { name: 'Width', value: '2' } },
  { command: 'variable', values: { name: 'WallHeight', value: '3' } },
  { command: 'variable', values: { name: 'WoodHeightScale', value: '1' } },
  { command: 'variable', values: { name: 'Pos', value: '1, 2, 3' } },
  { command: 'function', values: { name: 'AreaOf', parameters: 'W, D' } },
  { command: 'return', values: { value: '1' } },
  { command: 'end' },
]);

const WORDS = [
  { word: 'New', detail: 'Start a new pick' },
  { word: 'Add', detail: 'Pick more faces' },
  { word: 'Remove', detail: 'Drop faces from the pick' },
  { word: 'Reverse', detail: 'Flip the pick' },
];

const SCOPE: SolidScriptSuggestionScope = { names: solidScriptDocumentNames(SCRIPT), extra: [], words: [] };
const WORDY: SolidScriptSuggestionScope = { ...SCOPE, words: WORDS };

/**
 * Lists the labels suggested for the text before the caret.
 *
 * @param text Field text, with the caret at the end.
 * @param scope What the field may refer to.
 * @param words True when the field takes a few words.
 * @returns Labels in suggestion order.
 */
function labels(text: string, scope = SCOPE, words = false): string[] {
  return solidScriptSuggestions(solidScriptSuggestionContext(text, text.length, words), scope).map(
    (entry) => entry.label,
  );
}

/**
 * Lists the built-in functions suggested for the text before the caret.
 *
 * @param text Field text, with the caret at the end.
 * @returns Labels in suggestion order.
 */
function builtIn(text: string): string[] {
  return solidScriptSuggestions(solidScriptSuggestionContext(text, text.length, false), SCOPE)
    .filter((entry) => entry.category === 'Built-In Functions')
    .map((entry) => entry.label);
}

describe('SolidScript suggestions with fuzzy typing', () => {
  it('finds a variable by the first letters of its words and by scattered letters', () => {
    expect(labels('[wh')[0]).toBe('WallHeight');
    expect(labels('[wh')).toContain('WoodHeightScale');
    expect(labels('[whs')[0]).toBe('WoodHeightScale');
    expect(labels('[wdh')).toContain('Width');
    expect(labels('[wallheight')[0]).toBe('WallHeight');
    expect(labels('[wall_height')[0]).toBe('WallHeight');
  });

  it('puts an exact name first, then names that start with it, then the rest', () => {
    const list = labels('[W');
    expect(list.indexOf('Width')).toBeLessThan(list.indexOf('WallHeight'));
    const exact = labels('[Pos');
    expect(exact[0]).toBe('Pos');
  });

  it('finds built-in functions however they are typed', () => {
    expect(labels('[=padleft')).toContain('PadLeft');
    expect(labels('[=pad_left')).toContain('PadLeft');
    expect(labels('[=pl')).toContain('PadLeft');
    expect(labels('[=clmp')).toContain('Clamp');
    expect(labels('[=lrp')).toContain('Lerp');
  });

  it('lists every built-in function first when its whole name is typed', () => {
    const names = Object.keys(SOLID_SCRIPT_FUNCTIONS_BUILTIN).map((name) => solidScriptFunctionSpelling(name));
    expect(names.length).toBeGreaterThan(50);
    for (const name of names) {
      const list = builtIn(`[=${name}`);
      expect(list.indexOf(name), name).toBeGreaterThanOrEqual(0);
      const better = list.slice(0, list.indexOf(name)).filter((other) => other.toLowerCase() === name.toLowerCase());
      expect(better, name).toEqual([]);
    }
    const first = builtIn('[=Len');
    expect(first[0]).toBe('Len');
  });

  it('keeps names with the same fit in their catalog order', () => {
    const first = labels('[=a');
    const again = labels('[=a');
    expect(first).toEqual(again);
    expect(new Set(first).size).toBe(first.length);
  });

  it('lists only system names after a dollar sign', () => {
    const list = labels('[$');
    expect(list.length).toBeGreaterThan(5);
    expect(list.every((label) => label.startsWith('$'))).toBe(true);
    const typed = labels('[$sel');
    expect(typed.length).toBeGreaterThan(0);
    expect(typed.every((label) => label.startsWith('$'))).toBe(true);
  });

  it('finds members by their first letters after a dot', () => {
    expect(labels('[Pos.y')).toEqual(['Pos.Y']);
    expect(labels('[Pos.len')).toEqual(['Pos.Length']);
    expect(labels('[$Selected.Faces.fc')).toContain('$Selected.Faces.FaceCorners');
    expect(labels('[$Selected.Faces.cn')).toContain('$Selected.Faces.Count');
    expect(labels('[$Selected.Faces.zzzz')).toEqual([]);
  });

  it('ranks members: the exact member first, then those that start with it', () => {
    const list = labels('[$Selected.Faces.Cent');
    expect(list.slice(0, 2)).toEqual(['$Selected.Faces.Center', '$Selected.Faces.Centers']);
    expect(labels('[$Selected.Faces.Center')[0]).toBe('$Selected.Faces.Center');
  });

  it('finds the words of a field by first letters and keeps the typed word first', () => {
    expect(labels('rm', WORDY, true)).toEqual(['Remove']);
    expect(labels('re', WORDY, true)).toEqual(['Remove', 'Reverse']);
    expect(labels('rev', WORDY, true)[0]).toBe('Reverse');
    expect(labels('rv', WORDY, true)).toEqual(['Remove', 'Reverse']);
    expect(labels('zz', WORDY, true)).toEqual([]);
    expect(labels('Remove', WORDY, true)).toEqual(WORDS.map((word) => word.word));
  });

  it('offers nothing for text that fits nothing, one letter that starts no word, or odd text', () => {
    expect(labels('[qqqqqzzzzzzxx')).toEqual([]);
    expect(labels('[' + 'w'.repeat(5000))).toEqual([]);
    expect(labels('[é')).toEqual([]);
    expect(labels('[日本語')).toEqual([]);
  });

  it('caps the list and leaves $[ escapes alone', () => {
    expect(labels('[').length).toBeLessThanOrEqual(320);
    expect(solidScriptSuggestionContext('$[Wi', 4, false)).toBeNull();
    expect(solidScriptSuggestionContext('$[wh]', 3, false)).toBeNull();
    expect(labels('[=1 + [wh')[0]).toBe('WallHeight');
  });
});
