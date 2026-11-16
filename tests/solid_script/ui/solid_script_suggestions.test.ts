import { describe, expect, it } from 'vitest';
import { SOLID_SCRIPT_SYSTEM_GLOBALS } from '@/solid_script/language/solid_script_system.js';
import { solidScriptFunctionSpelling } from '@/solid_script/language/solid_script_name_key.js';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import {
  SOLID_SCRIPT_FUNCTION_DOCS,
  solidScriptFunctionArguments,
} from '@/solid_script/language/solid_script_function_docs.js';
import { solidScriptDocumentNames } from '@/solid_script/document/solid_script_document_names.js';
import {
  solidScriptSuggestionContext,
  solidScriptSuggestionHint,
  solidScriptSuggestionHintSignature,
  solidScriptSuggestionWrite,
  solidScriptSuggestions,
  type SolidScriptSuggestionScope,
} from '@/solid_script/ui/solid_script_suggestions.js';

const SCRIPT = solidScriptDocumentCreate([
  { command: 'input', values: { name: 'Steps', type: 'count' } },
  { command: 'variable', values: { name: 'Width', value: '2' } },
  { command: 'variable', values: { name: 'Angle', value: '30' } },
  { command: 'function', values: { name: 'Area', parameters: 'W, D' } },
  { command: 'return', values: { value: '[=[Local.W] * [Local.D]]' } },
  { command: 'end' },
]);

const WORDS = [
  { word: 'New', detail: 'Start a new pick' },
  { word: 'Add', detail: 'Pick more faces' },
  { word: 'Remove', detail: 'Drop faces from the pick' },
];

const SCOPE: SolidScriptSuggestionScope = { names: solidScriptDocumentNames(SCRIPT), extra: [], words: [] };
const WORDY: SolidScriptSuggestionScope = { ...SCOPE, words: WORDS };

/**
 * Reads the context at the | in a field text.
 *
 * @param marked Field text with | at the caret.
 * @param words True when the field takes a few words.
 * @returns Context.
 */
function at(marked: string, words = false) {
  const caret = marked.indexOf('|');
  return solidScriptSuggestionContext(marked.replace('|', ''), caret, words);
}

/**
 * Lists the suggestions at the | as category: label.
 *
 * @param marked Field text with | at the caret.
 * @param scope What the field may refer to.
 * @returns Suggestions.
 */
function offered(marked: string, scope = SCOPE): string[] {
  return solidScriptSuggestions(at(marked, scope.words.length > 0), scope).map(
    (entry) => `${entry.category}: ${entry.label}`,
  );
}

describe('SolidScript suggestion context', () => {
  it('knows what is typed at the caret', () => {
    expect(at('[A|')).toMatchObject({ kind: 'name', from: 0, prefix: 'A' });
    expect(at('1, [|')).toMatchObject({ kind: 'name', from: 3, prefix: '' });
    expect(at('[Local.|')).toMatchObject({ kind: 'name', prefix: 'Local.' });
    expect(at('[Box.W|')).toMatchObject({ kind: 'name', prefix: 'Box.W' });
    expect(at('[=|')).toMatchObject({ kind: 'formula', from: 2, prefix: '', call: null });
    expect(at('[=[Width] * A|')).toMatchObject({ kind: 'formula', from: 12, prefix: 'A', call: null });
    expect(at('[=Abs(|')).toMatchObject({ kind: 'formula', prefix: '', call: { name: 'Abs', argument: 0 } });
    expect(at('[=Lerp(1, W|')).toMatchObject({ kind: 'formula', prefix: 'W', call: { name: 'Lerp', argument: 1 } });
    expect(at('[=Max(Abs(1), |')).toMatchObject({ call: { name: 'Max', argument: 1 } });
    expect(at('[=Abs([St|')).toMatchObject({ kind: 'name', prefix: 'St' });
    expect(at('[Width]|')).toBeNull();
    expect(at('plain text|')).toBeNull();
    expect(at('$[Wi|')).toBeNull();
    expect(at('[=2 |')).toBeNull();
    expect(at('[="Abs|')).toBeNull();
    expect(at('Ad|', true)).toMatchObject({ kind: 'word', from: 0, prefix: 'Ad' });
    expect(at('|New', true)).toMatchObject({ kind: 'word', prefix: '' });
    expect(at('[|', true)).toMatchObject({ kind: 'name' });
  });
});

describe('SolidScript suggestions', () => {
  it('suggests matching names, system values and functions after [', () => {
    const list = offered('[A|');
    expect(list.slice(0, 2)).toEqual(['Variables: Angle', 'Functions: Area']);
    expect(list).toContain('Built-In Functions: Abs');
    expect(list.every((entry) => /: .*a/i.test(entry))).toBe(true);
    expect(offered('[W|')).toContain('System: Box.Width');
    expect(offered('[|')).toContain('System: Time.Year');
  });

  it('lists the best matches of a group first', () => {
    const list = offered('[=Le|').filter((entry) => entry.startsWith('Built-In'));
    expect(list.slice(0, 3)).toEqual([
      'Built-In Functions: Len',
      'Built-In Functions: Length',
      'Built-In Functions: Lerp',
    ]);
    expect(list).toContain('Built-In Functions: PadLeft');
    expect(list.indexOf('Built-In Functions: Lerp')).toBeLessThan(list.indexOf('Built-In Functions: PadLeft'));
  });

  it('offers the words of a field first and only them while one is typed', () => {
    expect(offered('|', WORDY)).toEqual(['Choices: New', 'Choices: Add', 'Choices: Remove']);
    expect(offered('Re|', WORDY)).toEqual(['Choices: Remove']);
    expect(offered('New|', WORDY)).toEqual(['Choices: New', 'Choices: Add', 'Choices: Remove']);
  });

  it('finds the function and the input the caret is in, nested calls and commas included', () => {
    const clamp = solidScriptSuggestionHint(at('[=Clamp(1, |'), SCOPE)!;
    expect(clamp.name).toBe('Clamp');
    expect(clamp.current).toBe(1);
    expect(clamp.inputs.map((input) => `${input.name}: ${input.type}`)).toEqual([
      'Value: Number',
      'Min: Number',
      'Max: Number',
    ]);
    expect(solidScriptSuggestionHintSignature(clamp)).toBe('Clamp(Value: Number, Min: Number, Max: Number) -> Number');
    expect(clamp.summary).toBe('Keeps a number between min and max.');
    expect(solidScriptSuggestionHint(at('[=Clamp(|'), SCOPE)?.current).toBe(0);
    expect(solidScriptSuggestionHint(at('[=Clamp([Width], Pow(2, |'), SCOPE)).toMatchObject({
      name: 'Pow',
      current: 1,
    });
    expect(solidScriptSuggestionHint(at('[=Clamp(Pow(2, 3), |'), SCOPE)).toMatchObject({ name: 'Clamp', current: 1 });
    expect(solidScriptSuggestionHint(at('[=Clamp(Str("a, b"), |'), SCOPE)).toMatchObject({ name: 'Clamp', current: 1 });
    // Past the last named input of a function that takes more, the "..." input stays current.
    const max = solidScriptSuggestionHint(at('[=Max(1, 2, 3, |'), SCOPE)!;
    expect(max.inputs[max.current]?.name).toBe('...');
    const own = solidScriptSuggestionHint(at('[=Area(1, |'), SCOPE)!;
    expect(own).toMatchObject({ name: 'Area', current: 1, summary: 'Function of this script.' });
    expect(own.inputs.map((input) => input.name)).toEqual(['W', 'D']);
    expect(solidScriptSuggestionHint(at('[=|'), SCOPE)).toBeNull();
  });

  it('knows the inputs, their kind and meaning, and the result of every built-in function', () => {
    for (const key of Object.keys(SOLID_SCRIPT_FUNCTION_DOCS)) {
      const doc = SOLID_SCRIPT_FUNCTION_DOCS[key]!;
      expect(doc.gives, key).not.toBe('');
      for (const input of solidScriptFunctionArguments(key)) {
        expect(input.type, `${key} ${input.name}`).not.toBe('');
        expect(input.about, `${key} ${input.name}`).not.toBe('');
      }
    }
  });

  it('writes a pick the way the caret position needs it', () => {
    const pick = (label: string, marked: string, scope = SCOPE) => {
      const caret = marked.indexOf('|');
      const text = marked.replace('|', '');
      const kind = label === 'Abs' ? 'function' : scope === WORDY ? 'word' : 'value';
      const entry = { label, detail: '', category: '', pick: kind } as const;
      const written = solidScriptSuggestionWrite(entry, text, caret, caret);
      return written.text.slice(0, written.caret) + '|' + written.text.slice(written.caret);
    };
    expect(pick('Width', '[Wi|]')).toBe('[Width]|');
    expect(pick('Width', '1, |')).toBe('1, [Width]|');
    expect(pick('Width', '[=Abs(Wi|)]')).toBe('[=Abs(Width|)]');
    expect(pick('Abs', '[A|')).toBe('[=Abs(|)]');
    expect(pick('Abs', '[=1 + A|]')).toBe('[=1 + Abs(|)]');
    expect(pick('Box.Width', '[=|]')).toBe('[=Box.Width|]');
    expect(pick('Add', 'Ne|w', WORDY)).toBe('Add|');
  });

  it('lists every value group after an open bracket', () => {
    const all = solidScriptSuggestions(at('[|'), WORDY);
    expect([...new Set(all.map((entry) => entry.category))]).toEqual([
      'Inputs',
      'Variables',
      'Locals',
      'System',
      'Functions',
      'Built-In Functions',
    ]);
    expect(all.filter((entry) => entry.category === 'System').length).toBeGreaterThan(30);
    const labels = new Set(all.map((entry) => entry.label));
    for (const value of SOLID_SCRIPT_SYSTEM_GLOBALS) expect(labels.has(value.name), value.name).toBe(true);
    for (const key of Object.keys(SOLID_SCRIPT_FUNCTION_DOCS))
      expect(labels.has(solidScriptFunctionSpelling(key)), key).toBe(true);
  });

  it('lists the locals of a Function and explains built-in values and functions', () => {
    const locals = solidScriptSuggestions(at('[Local.|'), SCOPE).map((entry) => entry.label);
    expect(locals).toEqual(['Local.W', 'Local.D']);
    const year = solidScriptSuggestions(at('[Time.Y|'), SCOPE);
    expect(year.map((entry) => entry.label)).toEqual(['Time.Year']);
    expect(year[0]?.detail).toMatch(/^Number: year/);
    const pad = solidScriptSuggestions(at('[=pad_l|'), SCOPE);
    expect(pad[0]?.detail).toBe('PadLeft(text, width, fill): Fills in front up to a width: 007.');
  });
});
