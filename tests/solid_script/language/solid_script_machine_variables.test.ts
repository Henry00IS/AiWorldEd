import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptTypeCheck } from '@/solid_script/language/solid_script_use_check.js';

/**
 * Builds one script line.
 *
 * @param command Command id.
 * @param values Field texts by key.
 * @returns Line.
 */
const line = (command: string, values: Record<string, string> = {}): SolidScriptLine => ({ command, values });

/** A Cube whose brush goes into the variable Brush. */
const CUBE_INTO_BRUSH = line('cube', { size: '2, 3, 4', into: 'Brush' });

/** Prints the Data value Kind of every edge of Brush, one Print line per edge. */
const PRINT_EVERY_EDGE_KIND = [
  line('for_each', { variable: 'Edge', list: '[Brush.Edges]' }),
  line('echo', { value: '[Edge.Data.Kind]' }),
  line('end'),
];

/**
 * Runs lines and returns what they printed, failing the test when the run
 * stops.
 *
 * @param lines Script lines.
 * @returns One message per Print line run.
 */
function printed(lines: SolidScriptLine[]): string[] {
  const result = solidScriptProgramRun(solidScriptDocumentCreate(lines));
  expect(result.error?.message ?? null).toBeNull();
  return result.messages;
}

/**
 * Runs lines and returns the message that stopped them.
 *
 * @param lines Script lines.
 * @returns Error message, or an empty string when the run did not stop.
 */
function stopped(lines: SolidScriptLine[]): string {
  return solidScriptProgramRun(solidScriptDocumentCreate(lines)).error?.message ?? '';
}

/**
 * Reads how many edges the brush of a Cube has, from the script itself.
 *
 * @returns Edge count.
 */
function cubeEdgeCount(): number {
  const [count = ''] = printed([CUBE_INTO_BRUSH, line('echo', { value: '[Brush.Edges.Count]' })]);
  return Number(count);
}

describe('SolidScript Set of Data through list members', () => {
  it('writes Brush.Edges.Data.Kind to every edge of the brush', () => {
    const edges = cubeEdgeCount();
    expect(edges).toBeGreaterThan(0);
    const kinds = printed([
      CUBE_INTO_BRUSH,
      line('variable', { name: 'Brush.Edges.Data.Kind', value: 'trim' }),
      ...PRINT_EVERY_EDGE_KIND,
    ]);
    expect(kinds).toEqual(Array.from({ length: edges }, () => 'trim'));
  });

  it('reads [Brush.Edges.Data.Kind] back as one value per edge', () => {
    const [count = '', kinds = ''] = printed([
      CUBE_INTO_BRUSH,
      line('variable', { name: 'Brush.Edges.Data.Kind', value: 'trim' }),
      line('echo', { value: '[Brush.Edges.Data.Kind.Count]' }),
      line('echo', { value: '[Brush.Edges.Data.Kind]' }),
    ]);
    expect(Number(count)).toBe(cubeEdgeCount());
    expect(kinds).toBe(`[${Array.from({ length: cubeEdgeCount() }, () => 'trim').join(', ')}]`);
  });

  it('takes the key from a variable, as in Brush.Edges.Data.[Key]', () => {
    const kinds = printed([
      CUBE_INTO_BRUSH,
      line('variable', { name: 'Key', value: 'Kind' }),
      line('variable', { name: 'Brush.Edges.Data.[Key]', value: 'seam' }),
      ...PRINT_EVERY_EDGE_KIND,
    ]);
    expect(kinds).toEqual(Array.from({ length: cubeEdgeCount() }, () => 'seam'));
  });

  it('writes only the edges of one face through Brush.Faces(0).Edges.Data', () => {
    const [faceEdges = '', ...kinds] = printed([
      CUBE_INTO_BRUSH,
      line('variable', { name: 'Brush.Faces(0).Edges.Data.Kind', value: 'rim' }),
      line('echo', { value: '[Brush.Faces(0).Edges.Count]' }),
      ...PRINT_EVERY_EDGE_KIND,
    ]);
    expect(Number(faceEdges)).toBeGreaterThan(0);
    expect(kinds.length).toBeGreaterThan(Number(faceEdges));
    expect(kinds.filter((kind) => kind === 'rim').length).toBe(Number(faceEdges));
  });

  it('writes the brush of an edge through Edge.Parent.Data', () => {
    expect(
      printed([
        CUBE_INTO_BRUSH,
        line('variable', { name: 'Edge', value: '[Brush.Edges.First]' }),
        line('variable', { name: 'Edge.Parent.Data.Kind', value: 'crate' }),
        line('echo', { value: '[Brush.Data.Kind]' }),
      ]),
    ).toEqual(['crate']);
  });

  it('still stops a line that sets a member itself', () => {
    expect(stopped([CUBE_INTO_BRUSH, line('variable', { name: 'Brush.Edges', value: '1' })])).toMatch(
      /Brush\.Edges can only be read/,
    );
    expect(stopped([CUBE_INTO_BRUSH, line('variable', { name: 'Brush.Faces(0).Center', value: '1' })])).toMatch(
      /Brush\.Faces\(0\)\.Center can only be read/,
    );
    expect(stopped([CUBE_INTO_BRUSH, line('variable', { name: 'Brush.Edges.Data', value: '1' })])).toMatch(
      /Brush\.Edges\.Data needs a key to set/,
    );
  });
});

/**
 * Builds a Set line, with a Type when one is given.
 *
 * @param name Variable.
 * @param value Value text.
 * @param type Declared Type, empty for none.
 * @returns Line.
 */
const setTyped = (name: string, value: string, type = ''): SolidScriptLine =>
  line('variable', type === '' ? { name, value } : { name, value, type });

/** Declares Width a Number List holding 5, 3 and 7. */
const WIDTH_NUMBERS = setTyped('Width', '5,3,7', 'Number List');

describe('SolidScript declared Types on every write', () => {
  it('stops Add Item of a value that is no number into a Number List, as Henry found', () => {
    expect(stopped([WIDTH_NUMBERS, line('add_item', { value: '78o', list: 'Width' }), line('cube')])).toMatch(
      /^line 2: \[Width\] is declared Number List, so it cannot hold Text "78o" as an item \(Did you mean 78\?\)/,
    );
  });

  it('turns an added item into the kind of the list', () => {
    expect(
      printed([
        WIDTH_NUMBERS,
        line('add_item', { value: '78', list: 'Width' }),
        line('insert_item', { value: '1', list: 'Width', at: '0' }),
        setTyped('Names', 'a, b', 'Text List'),
        line('add_item', { value: '45', list: 'Names' }),
        line('echo', { value: '[=[Width(4)] + 1]|[Width(0)]|[Names(2).Length]' }),
        line('cube'),
      ]),
    ).toEqual(['79|1|2']);
  });

  it('stops Insert Item, Set of an item and Set of a vector part with the wrong kind', () => {
    expect(
      stopped([WIDTH_NUMBERS, line('insert_item', { value: 'oak', list: 'Width', at: '1' }), line('cube')]),
    ).toMatch(/^line 2: \[Width\] is declared Number List/);
    expect(stopped([WIDTH_NUMBERS, setTyped('Width(0)', 'oak'), line('cube')])).toMatch(
      /^line 2: \[Width\] is declared Number List/,
    );
    expect(stopped([setTyped('Label', 'door', 'Text'), setTyped('Label', '[=Vector(1, 2, 3)]'), line('cube')])).toMatch(
      /^line 2: \[Label\] is declared Text/,
    );
  });

  it('gives Clear Variable the empty value of the Type and keeps the Type', () => {
    expect(
      printed([
        WIDTH_NUMBERS,
        line('clear_variable', { name: 'Width' }),
        line('echo', { value: '[Width.Count]' }),
        line('cube'),
      ]),
    ).toEqual(['0']);
    expect(
      printed([
        setTyped('Size', '4', 'Number'),
        line('clear_variable', { name: 'Size' }),
        line('echo', { value: '[=[Size] + 1]' }),
        line('cube'),
      ]),
    ).toEqual(['1']);
    expect(
      stopped([
        setTyped('Size', '4', 'Number'),
        line('clear_variable', { name: 'Size' }),
        setTyped('Size', 'oak'),
        line('cube'),
      ]),
    ).toMatch(/^line 3: \[Size\] is declared Number/);
  });

  it('drops the Type with Delete Variable, so the name starts over', () => {
    expect(
      printed([
        setTyped('Size', '4', 'Number'),
        line('delete_variable', { name: 'Size' }),
        setTyped('Size', 'oak'),
        line('echo', { value: '[Size]' }),
        line('cube'),
      ]),
    ).toEqual(['oak']);
  });

  it('checks what building blocks write to Into: a brush fits Brush and Brush List, not Number', () => {
    expect(stopped([setTyped('Made', '0', 'Number'), line('cube', { into: 'Made' })])).toMatch(
      /^line 2: \[Made\] is declared Number, so it cannot hold a Brush/,
    );
    expect(stopped([setTyped('Made', '', 'Text'), line('sphere', { into: 'Made' })])).toMatch(
      /^line 2: \[Made\] is declared Text/,
    );
    expect(
      printed([
        setTyped('Made', '', 'Brush List'),
        line('cube', { into: 'Made' }),
        line('echo', { value: '[Made.Count]' }),
      ]),
    ).toEqual(['1']);
    expect(
      printed([
        line('cube', { into: 'Made' }),
        setTyped('Made', '[Made]', 'Brush'),
        line('cube', { into: 'Made' }),
        line('echo', { value: '[Made.Faces.Count]' }),
      ]),
    ).toEqual(['6']);
  });

  it('checks the lists face lines write, the loop names and Find Item results', () => {
    expect(
      stopped([
        setTyped('Top', '0', 'Number'),
        line('cube'),
        line('select_faces', { which: 'Facing Up', into: 'Top' }),
      ]),
    ).toMatch(/^line 3: \[Top\] is declared Number/);
    expect(
      stopped([
        setTyped('Item', '0', 'Number'),
        line('for_each', { variable: 'Item', list: 'a, b' }),
        line('end'),
        line('cube'),
      ]),
    ).toMatch(/^line 2: \[Item\] is declared Number, so it cannot hold Text "a"/);
    expect(
      stopped([
        setTyped('I', 'No', 'Yes/No'),
        line('repeat', { variable: 'I', from: '0', to: '2' }),
        line('end'),
        line('cube'),
      ]),
    ).toMatch(/^line 2: \[I\] is declared Yes\/No/);
    expect(
      stopped([
        WIDTH_NUMBERS,
        setTyped('Where', 'No', 'Yes/No'),
        line('find_item', { value: '3', list: 'Width', result: 'Where' }),
        line('cube'),
      ]),
    ).toMatch(/^line 3: \[Where\] is declared Yes\/No/);
  });

  it('checks the result a Call writes into a typed variable', () => {
    expect(
      stopped([
        setTyped('Area', '0', 'Number'),
        line('function', { name: 'Word', parameters: '' }),
        line('return', { value: 'oak' }),
        line('end'),
        line('call', { name: 'Word', values: '', result: 'Area' }),
        line('cube'),
      ]),
    ).toMatch(/\[Area\] is declared Number, so it cannot hold Text "oak"/);
  });

  it('leaves variables without a Type free to hold anything', () => {
    expect(
      printed([
        setTyped('Width', '5,3,7'),
        line('add_item', { value: '78o', list: 'Width' }),
        line('echo', { value: '[Width(3)]' }),
        line('cube'),
      ]),
    ).toEqual(['78o']);
  });

  it('agrees in the editor checks before running when the wrong kind is certain', () => {
    const warned = (lines: SolidScriptLine[]): string[] =>
      solidScriptTypeCheck(solidScriptDocumentCreate(lines)).map((warning) => `${warning.line}: ${warning.text}`);
    expect(warned([WIDTH_NUMBERS, line('add_item', { value: '78o', list: 'Width' })])).toEqual([
      '2: [Width] is declared Number List, so it cannot hold Text "78o" as an item (Did you mean 78?).',
    ]);
    expect(warned([WIDTH_NUMBERS, line('add_item', { value: '78', list: 'Width' })])).toEqual([]);
    expect(warned([setTyped('Made', '0', 'Number'), line('cube', { into: 'Made' })])).toEqual([
      '2: [Made] is declared Number, so it cannot hold a Brush.',
    ]);
    expect(warned([setTyped('Made', '', 'Brush List'), line('cube', { into: 'Made' })])).toEqual([]);
  });
});
