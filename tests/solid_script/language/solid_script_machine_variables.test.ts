import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';

/**
 * Builds one script line.
 *
 * @param command Command id.
 * @param values Field texts by key.
 * @returns Line.
 */
const line = (command: string, values: Record<string, string> = {}): SolidScriptLine => ({ command, values });

/** A Cube whose brush goes into the variable Brush. */
const CUBE_INTO_BRUSH = line('cube', { size: '2, 3, 4', into: 'Object' });

/** Prints the Data value Kind of every edge of Brush, one Print line per edge. */
const PRINT_EVERY_EDGE_KIND = [
  line('for_each', { variable: 'Edge', list: '[Object.Edges]' }),
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
  const [count = ''] = printed([CUBE_INTO_BRUSH, line('echo', { value: '[Object.Edges.Count]' })]);
  return Number(count);
}

describe('SolidScript Set of Data through list members', () => {
  it('writes Object.Edges.Data.Kind to every edge of the solid', () => {
    const edges = cubeEdgeCount();
    expect(edges).toBeGreaterThan(0);
    const kinds = printed([
      CUBE_INTO_BRUSH,
      line('variable', { name: 'Object.Edges.Data.Kind', value: 'trim' }),
      ...PRINT_EVERY_EDGE_KIND,
    ]);
    expect(kinds).toEqual(Array.from({ length: edges }, () => 'trim'));
  });

  it('reads [Object.Edges.Data.Kind] back as one value per edge', () => {
    const [count = '', kinds = ''] = printed([
      CUBE_INTO_BRUSH,
      line('variable', { name: 'Object.Edges.Data.Kind', value: 'trim' }),
      line('echo', { value: '[Object.Edges.Data.Kind.Count]' }),
      line('echo', { value: '[Object.Edges.Data.Kind]' }),
    ]);
    expect(Number(count)).toBe(cubeEdgeCount());
    expect(kinds).toBe(`[${Array.from({ length: cubeEdgeCount() }, () => 'trim').join(', ')}]`);
  });

  it('takes the key from a variable, as in Object.Edges.Data.[Key]', () => {
    const kinds = printed([
      CUBE_INTO_BRUSH,
      line('variable', { name: 'Key', value: 'Kind' }),
      line('variable', { name: 'Object.Edges.Data.[Key]', value: 'seam' }),
      ...PRINT_EVERY_EDGE_KIND,
    ]);
    expect(kinds).toEqual(Array.from({ length: cubeEdgeCount() }, () => 'seam'));
  });

  it('writes only the edges of one face through Object.Faces(0).Edges.Data', () => {
    const [faceEdges = '', ...kinds] = printed([
      CUBE_INTO_BRUSH,
      line('variable', { name: 'Object.Faces(0).Edges.Data.Kind', value: 'rim' }),
      line('echo', { value: '[Object.Faces(0).Edges.Count]' }),
      ...PRINT_EVERY_EDGE_KIND,
    ]);
    expect(Number(faceEdges)).toBeGreaterThan(0);
    expect(kinds.length).toBeGreaterThan(Number(faceEdges));
    expect(kinds.filter((kind) => kind === 'rim').length).toBe(Number(faceEdges));
  });

  it('writes the solid of an edge through Edge.Parent.Data', () => {
    expect(
      printed([
        CUBE_INTO_BRUSH,
        line('variable', { name: 'Edge', value: '[Object.Edges.First]' }),
        line('variable', { name: 'Edge.Parent.Data.Kind', value: 'crate' }),
        line('echo', { value: '[Object.Data.Kind]' }),
      ]),
    ).toEqual(['crate']);
  });

  it('still stops a line that sets a member itself', () => {
    expect(stopped([CUBE_INTO_BRUSH, line('variable', { name: 'Object.Edges', value: '1' })])).toMatch(
      /Object\.Edges can only be read/,
    );
    expect(stopped([CUBE_INTO_BRUSH, line('variable', { name: 'Object.Faces(0).Center', value: '1' })])).toMatch(
      /Object\.Faces\(0\)\.Center can only be read/,
    );
    expect(stopped([CUBE_INTO_BRUSH, line('variable', { name: 'Object.Edges.Data', value: '1' })])).toMatch(
      /Object\.Edges\.Data needs a key to set/,
    );
  });
});

/**
 * Builds a Set line.
 *
 * @param name Variable.
 * @param value Value.
 * @returns Line.
 */
const set = (name: string, value: string): SolidScriptLine => line('variable', { name, value });

describe('SolidScript variables hold any kind, like a script variable', () => {
  it('lets Add Item put any item in a list of numbers, as Henry found', () => {
    expect(
      printed([
        set('Width', '5,3,7'),
        line('add_item', { value: '78o', list: 'Width' }),
        line('add_item', { value: '78', list: 'Width' }),
        line('echo', { value: '[Width(3)]|[=[Width(4)] + 1]' }),
        line('cube'),
      ]),
    ).toEqual(['78o|79']);
  });

  it('lets any line give a variable a value of another kind', () => {
    expect(
      printed([
        set('Henry', 'Henry'),
        set('Henry', '4'),
        line('cube', { into: 'Henry' }),
        line('echo', { value: '[Henry.Faces.Count]' }),
      ]),
    ).toEqual(['6']);
  });

  it('gives Clear Variable the empty value of the kind the variable holds', () => {
    expect(
      printed([
        set('List', '1, 2, 3, 4'),
        set('Count', '7'),
        set('Word', 'oak'),
        set('On', '[=1 == 1]'),
        ...['List', 'Count', 'Word', 'On', 'Fresh'].map((name) => line('clear_variable', { name })),
        line('echo', { value: '[List.Count]|[Count]|[Word.Length]|[On]|[Fresh.Count]' }),
        line('cube'),
      ]),
    ).toEqual(['0|0|0|No|0']);
  });

  it('forgets a variable with Delete Variable', () => {
    expect(
      stopped([
        set('Width', '3'),
        line('delete_variable', { name: 'Width' }),
        line('echo', { value: '[Width]' }),
        line('cube'),
      ]),
    ).toMatch(/Width/);
  });
});
