import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import {
  solidScriptDocumentNames,
  solidScriptFieldNamesUnknown,
} from '@/solid_script/document/solid_script_document_names.js';
import {
  solidScriptSuggestionContext,
  solidScriptSuggestions,
} from '@/solid_script/ui/solid_script_configurator_names.js';

const SCRIPT = solidScriptDocumentCreate([
  { command: 'input', values: { name: 'steps', type: 'count' } },
  { command: 'variable', values: { name: 'width', value: '2' } },
  { command: 'variable', values: { name: 'points()', value: '0, 0' } },
  { command: 'variable', values: { name: 'part[i]', value: '1' } },
  { command: 'repeat', values: { variable: 'i' } },
  { command: 'end' },
  { command: 'function', values: { name: 'area', parameters: 'w, d', result: '[w] * [d]' } },
  { command: 'part', values: { name: 'column' } },
  { command: 'end' },
  { command: 'event', values: { name: 'finish' } },
  { command: 'end' },
  { command: 'variable', values: { name: 'width', value: '3' } },
]);

describe('SolidScript names', () => {
  it('lists what a script defines by kind, once, with the first line', () => {
    expect(solidScriptDocumentNames(SCRIPT).map(({ name, category, line }) => [name, category, line])).toEqual([
      ['steps', 'Inputs', 0],
      ['width', 'Variables', 1],
      ['points', 'Lists', 2],
      ['i', 'Counters', 4],
      ['area', 'Functions', 6],
      ['column', 'Parts', 7],
      ['finish', 'Events', 9],
    ]);
    expect(solidScriptDocumentNames(SCRIPT).find((entry) => entry.name === 'area')?.detail).toBe('area(w, d)');
  });

  it('finds [names] no line defines, skipping escapes and built names', () => {
    const known = new Set(['width', 'i']);
    expect(solidScriptFieldNamesUnknown('[width], [depth], [=[i] * [h]]', known)).toEqual(['depth', 'h']);
    expect(solidScriptFieldNamesUnknown('$[depth$] [part[i]] [points(0)]', known)).toEqual(['points']);
  });

  it('suggests names after [ and functions inside formulas', () => {
    const names = solidScriptDocumentNames(SCRIPT);
    expect(solidScriptSuggestionContext('[wi', 3)).toMatchObject({ from: 0, prefix: 'wi', bracket: true });
    expect(solidScriptSuggestionContext('1, [=[i] + ar', 13)).toMatchObject({
      prefix: 'ar',
      formula: true,
      bracket: false,
    });
    expect(solidScriptSuggestionContext('plain text', 10)).toBeNull();
    expect(solidScriptSuggestionContext('$[wi', 4)).toBeNull();
    const after = solidScriptSuggestions(solidScriptSuggestionContext('[', 1), names, ['x']);
    expect(after.map((entry) => entry.insert)).toEqual(['[steps]', '[width]', '[points]', '[i]', '[x]']);
    const inFormula = solidScriptSuggestions(solidScriptSuggestionContext('[=a', 3), names, []);
    expect(inFormula.map((entry) => [entry.category, entry.insert])).toEqual([
      ['Functions', 'area()'],
      ['Built-In Functions', 'abs()'],
      ['Built-In Functions', 'acos()'],
      ['Built-In Functions', 'asin()'],
      ['Built-In Functions', 'atan()'],
      ['Built-In Functions', 'atan2()'],
    ]);
    const all = solidScriptSuggestions(null, names, []);
    expect(all.find((entry) => entry.label === 'area')?.insert).toBe('[=area()]');
  });
});
