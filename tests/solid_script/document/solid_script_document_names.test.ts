import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import {
  solidScriptDocumentNames,
  solidScriptDocumentNamesAt,
  solidScriptDocumentOrigins,
  solidScriptFieldNamesUnknown,
} from '@/solid_script/document/solid_script_document_names.js';

const SCRIPT = solidScriptDocumentCreate([
  { command: 'input', values: { name: 'steps', type: 'count' } },
  { command: 'variable', values: { name: 'width', value: '2' } },
  { command: 'variable', values: { name: 'points()', value: '0, 0' } },
  { command: 'variable', values: { name: 'part[i]', value: '1' } },
  { command: 'repeat', values: { variable: 'i' } },
  { command: 'end' },
  { command: 'function', values: { name: 'area', parameters: 'w, d' } },
  { command: 'return', values: { value: '[=[local.w] * [local.d]]' } },
  { command: 'variable', values: { name: 'local.sum', value: '1' } },
  { command: 'end' },
  { command: 'part', values: { name: 'column' } },
  { command: 'end' },
  { command: 'when_input_changes', values: { name: 'steps' } },
  { command: 'end' },
  { command: 'call', values: { name: 'area', values: '1, 2', result: 'size' } },
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
      ['Local.w', 'Locals', 6],
      ['Local.d', 'Locals', 6],
      ['Local.sum', 'Locals', 8],
      ['column', 'Parts', 10],
      ['steps', 'Handlers', 12],
      ['size', 'Variables', 14],
    ]);
    expect(solidScriptDocumentNames(SCRIPT).find((entry) => entry.name === 'area')?.detail).toBe('area(w, d)');
  });

  it('offers a Function its own locals and a loop its counter only on the lines inside them', () => {
    const scoped = solidScriptDocumentCreate([
      { command: 'function', values: { name: 'area', parameters: 'w, d' } },
      { command: 'variable', values: { name: 'local.sum', value: '1' } },
      { command: 'return', values: { value: '[local.sum]' } },
      { command: 'end' },
      { command: 'function', values: { name: 'lift', parameters: 'h' } },
      { command: 'variable', values: { name: 'local.sum', value: '2' } },
      { command: 'end' },
      { command: 'repeat', values: { variable: 'i' } },
      { command: 'for_each_scattered_point', values: {} },
      { command: 'cube' },
      { command: 'end' },
      { command: 'end' },
      { command: 'repeat', values: { variable: 'i' } },
      { command: 'end' },
      { command: 'cube' },
    ]);
    const at = (line: number) =>
      solidScriptDocumentNamesAt(scoped, line)
        .filter((entry) => ['Locals', 'Counters', 'System'].includes(entry.category))
        .map((entry) => entry.name);
    expect(at(2)).toEqual(['Local.w', 'Local.d', 'Local.sum']);
    expect(at(5)).toEqual(['Local.h']);
    expect(at(6)).toEqual(['Local.h', 'Local.sum']);
    expect(at(8)).toEqual(['i']);
    expect(at(9)).toEqual(['i', 'Point.Index', 'Point.Position', 'Point.Normal', 'Face.Center', 'Face.Tag']);
    expect(at(13)).toEqual(['i']);
    expect(at(14)).toEqual([]);
    expect(solidScriptDocumentNamesAt(scoped, 14).map((entry) => entry.name)).toEqual(['area', 'lift']);
  });

  it('finds [names] no line defines, skipping escapes and built names', () => {
    const known = new Set(['width', 'i']);
    expect(solidScriptFieldNamesUnknown('[width], [depth], [=[i] * [h]]', known)).toEqual(['depth', 'h']);
    expect(solidScriptFieldNamesUnknown('$[depth$] [part[i]] [points(0)]', known)).toEqual(['points']);
  });
});

describe('SolidScript origins', () => {
  it('lists every line that sets a name, lists by their plain name', () => {
    const origins = solidScriptDocumentOrigins(
      solidScriptDocumentCreate([
        { command: 'variable', values: { name: 'w', value: '1' } },
        { command: 'variable', values: { name: 'pts()', value: '0, 0' } },
        { command: 'variable', values: { name: 'w', value: '2' } },
        { command: 'remove_item', values: { target: 'pts(0)' } },
        { command: 'function', values: { name: 'f', parameters: 'a, b' } },
        { command: 'end' },
        { command: 'repeat', values: { variable: 'i' } },
        { command: 'end' },
      ]),
    );
    expect(Object.fromEntries(origins)).toEqual({ w: [0, 2], pts: [1, 3], 'Local.a': [4], 'Local.b': [4], i: [6] });
  });
});
