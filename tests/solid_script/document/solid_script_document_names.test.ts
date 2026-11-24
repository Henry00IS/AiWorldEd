import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import {
  solidScriptDocumentNames,
  solidScriptDocumentNamesAt,
  solidScriptDocumentOrigins,
  solidScriptDocumentNamesUnknown,
  solidScriptDocumentNotesAbove,
  solidScriptFieldKnown,
  solidScriptFieldUnknown,
} from '@/solid_script/document/solid_script_document_names.js';

const SCRIPT = solidScriptDocumentCreate([
  { command: 'input', values: { name: 'steps', type: 'Count' } },
  { command: 'variable', values: { name: 'width', value: '2' } },
  { command: 'variable', values: { name: 'points()', value: '0, 0' } },
  { command: 'variable', values: { name: 'part[i]', value: '1' } },
  { command: 'repeat', values: { variable: 'i' } },
  { command: 'end' },
  { command: 'function', values: { name: 'area', parameters: 'w, d' } },
  { command: 'return', values: { value: '[=[$local.w] * [$local.d]]' } },
  { command: 'variable', values: { name: '$local.sum', value: '1' } },
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
      ['$Local.w', 'Locals', 6],
      ['$Local.d', 'Locals', 6],
      ['$Local.sum', 'Locals', 8],
      ['column', 'Variables', 10],
      ['column', 'Parts', 10],
      ['steps', 'Handlers', 12],
      ['size', 'Variables', 14],
    ]);
    expect(solidScriptDocumentNames(SCRIPT).find((entry) => entry.name === 'area')?.detail).toBe('area(w, d)');
  });

  it('offers a Function its own locals and a loop its counter only on the lines inside them', () => {
    const scoped = solidScriptDocumentCreate([
      { command: 'function', values: { name: 'area', parameters: 'w, d' } },
      { command: 'variable', values: { name: '$local.sum', value: '1' } },
      { command: 'return', values: { value: '[$local.sum]' } },
      { command: 'end' },
      { command: 'function', values: { name: 'lift', parameters: 'h' } },
      { command: 'variable', values: { name: '$local.sum', value: '2' } },
      { command: 'end' },
      { command: 'repeat', values: { variable: 'i' } },
      { command: 'for_each', values: { variable: 'P', list: '1, 2', key: 'N' } },
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
    expect(at(2)).toEqual(['$Local.w', '$Local.d', '$Local.sum']);
    expect(at(5)).toEqual(['$Local.h']);
    expect(at(6)).toEqual(['$Local.h', '$Local.sum']);
    expect(at(8)).toEqual(['i']);
    expect(at(9)).toEqual(['i', 'P', 'N']);
    expect(at(13)).toEqual(['i']);
    expect(at(14)).toEqual([]);
    expect(solidScriptDocumentNamesAt(scoped, 14).map((entry) => entry.name)).toEqual(['area', 'lift']);
  });

  it('finds [names] and calls no line defines, skipping escapes and built names', () => {
    const known = solidScriptFieldKnown(
      [
        { name: 'Width', category: 'Variables', line: 0, detail: '' },
        { name: 'i', category: 'Counters', line: 0, detail: '' },
        { name: 'Area', category: 'Functions', line: 0, detail: 'Area(w)' },
      ],
      ['x'],
    );
    const written = (text: string): string[] => solidScriptFieldUnknown(text, known).map((entry) => entry.written);
    expect(written('[width], [depth], [=[i] * [h] + [x]]')).toEqual(['depth', 'h']);
    expect(written('$[depth$] [part[i]] [points(0)] [Pos.x]')).toEqual(['points', 'Pos']);
    expect(solidScriptFieldUnknown('[=Area(1) + Max(2, 3) + Spto(1) + [$Local.A]]', known)).toEqual([
      { written: 'Spto', key: 'spto()', call: true },
      { written: '$Local.A', key: '$local.a', call: false },
    ]);
  });

  it('marks per line the names and calls the line cannot see', () => {
    const script = solidScriptDocumentCreate([
      { command: 'function', values: { name: 'Spin', parameters: 'Angle' } },
      { command: 'variable', values: { name: '$Local.Turn', value: '[=[$Local.Anglex] + [$Local.Angle]]' } },
      { command: 'end' },
      { command: 'variable', values: { name: 'Width', value: '[Widht]' } },
      { command: 'variable', values: { name: 'Depth', value: '[=Spin([Width]) + Spn(1)]' } },
      { command: 'variable', values: { name: 'Off', value: '[$Local.Angle]' }, off: true },
    ]);
    expect(solidScriptDocumentNamesUnknown(script)).toEqual(
      new Map([
        [1, new Set(['$local.anglex'])],
        [3, new Set(['widht'])],
        [4, new Set(['spn()'])],
      ]),
    );
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
    expect(Object.fromEntries(origins)).toEqual({ w: [0, 2], pts: [1, 3], '$Local.a': [4], '$Local.b': [4], i: [6] });
  });

  it.each([
    ['one Note right above', ['note:A point.', 'function'], 'A point.'],
    ['Note lines right above, top first', ['note:Where a', 'note:post stands.', 'function'], 'Where a post stands.'],
    ['a Note with a line between', ['note:A point.', 'blank', 'function'], undefined],
    ['a Note with another block between', ['note:A point.', 'cube', 'function'], undefined],
    ['no Note', ['cube', 'function'], undefined],
  ])('describes a Function by %s', (_case, lines, description) => {
    const blocks: SolidScriptLine[] = lines.map((line) =>
      line.startsWith('note:') ? { command: 'note', values: { text: line.slice(5) } } : { command: line },
    );
    blocks[blocks.length - 1] = { command: 'function', values: { name: 'Spot', parameters: 'A' } };
    const script = solidScriptDocumentCreate([
      ...blocks,
      { command: 'return', values: { value: '[0, 1, 0]' } },
      { command: 'end' },
    ]);
    const spot = solidScriptDocumentNamesAt(script, script.blocks.length).find((entry) => entry.name === 'Spot');
    expect(spot?.description).toBe(description);
    expect(spot?.detail).toBe('Spot(A)');
    expect(spot?.gives).toBe('Vector');
  });

  it('reads the Notes right above any line, which only a Function uses', () => {
    const script = solidScriptDocumentCreate([{ command: 'note', values: { text: 'Box.' } }, { command: 'cube' }]);
    expect(solidScriptDocumentNotesAbove(script, 1)).toBe('Box.');
    expect(solidScriptDocumentNamesAt(script, 2).some((entry) => entry.description !== undefined)).toBe(false);
  });
});
