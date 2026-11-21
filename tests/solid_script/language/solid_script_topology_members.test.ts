import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptMemberType } from '@/solid_script/language/solid_script_members.js';

const line = (command: string, values: Record<string, string> = {}): SolidScriptLine => ({ command, values });
const END = line('end');
const BOX = line('cube', { size: '2, 2, 2', anchor: 'Center, Center, Center', into: 'Box' });
const GRID = [
  line('grid_mesh', { size: '2, 0, 2', columns: '2', rows: '2' }),
  line('select_brushes'),
  line('variable', { name: 'Grid', value: '[$Selected.Brushes.First]' }),
];

/**
 * Runs lines and returns what Echo printed, failing on a stop.
 *
 * @param lines Script lines.
 * @returns Printed messages.
 */
function printed(...lines: SolidScriptLine[]): string[] {
  const result = solidScriptProgramRun(solidScriptDocumentCreate(lines));
  expect(result.error?.message ?? null).toBeNull();
  return result.messages;
}

describe('SolidScript topology members', () => {
  it('declares every new member with its list form for autocomplete and checks', () => {
    expect(solidScriptMemberType('Edge', 'Angle')).toBe('Number');
    expect(solidScriptMemberType('Edge List', 'Angles')).toBe('Number List');
    expect(solidScriptMemberType('Edge', 'IsBoundary')).toBe('Yes/No');
    expect(solidScriptMemberType('Edge List', 'IsBoundaries')).toBe('Yes/No List');
    expect(solidScriptMemberType('Face', 'Neighbors')).toBe('Face List');
    expect(solidScriptMemberType('Vertex', 'Faces')).toBe('Face List');
    expect(solidScriptMemberType('Vertex', 'Edges')).toBe('Edge List');
    expect(solidScriptMemberType('Brush', 'Islands')).toBe('List');
    expect(solidScriptMemberType('Mesh', 'Islands')).toBe('List');
  });

  it('reads the angle between the faces of an edge, and boundaries, on a brush', () => {
    expect(
      printed(
        BOX,
        line('echo', { value: '[Box.Edges.First.Angle]|[Box.Edges.First.IsBoundary]|[Box.Edges.Angles.Count]' }),
      ),
    ).toEqual(['90|No|12']);
  });

  it('gives flat and open mesh edges an angle of 0 and marks the open ones as boundaries', () => {
    const [text = ''] = printed(
      ...GRID,
      line('variable', { name: 'Open', value: '0' }),
      line('variable', { name: 'Bent', value: '0' }),
      line('for_each', { variable: 'E', list: '[Grid.Edges]' }),
      line('if', { condition: '[E.IsBoundary]' }),
      line('variable', { name: 'Open', value: '[=[Open] + 1]' }),
      END,
      line('if', { condition: '[=[E.Angle] > 0]' }),
      line('variable', { name: 'Bent', value: '[=[Bent] + 1]' }),
      END,
      END,
      line('echo', { value: '[Open]|[Bent]|[Grid.Edges.Count]' }),
    );
    // Edges along one line read as one edge, so the 2 by 2 grid has 6: 4 open sides and 2 inside.
    expect(text).toBe('4|0|6');
  });

  it('finds the neighbours of a face and the faces and edges at a corner', () => {
    expect(
      printed(
        BOX,
        line('echo', {
          value: '[Box.Faces.First.Neighbors.Count]|[Box.Vertices.First.Faces.Count]|[Box.Vertices.First.Edges.Count]',
        }),
      ),
    ).toEqual(['4|3|3']);
    expect(printed(...GRID, line('echo', { value: '[Grid.Faces.First.Neighbors.Count]' }))).toEqual(['2']);
  });

  it('splits a mesh into islands of faces, and a brush is one island', () => {
    expect(
      printed(
        line('mesh'),
        ...['0, 0, 0', '1, 0, 0', '0, 1, 0', '1, 1, 0', '5, 0, 0', '6, 0, 0', '5, 1, 0'].map((position) =>
          line('vertex', { position }),
        ),
        line('face', { corners: '0, 1, 2' }),
        line('face', { corners: '2, 1, 3' }),
        line('face', { corners: '4, 5, 6' }),
        END,
        line('select_brushes'),
        line('variable', { name: 'Lumps', value: '[$Selected.Brushes.First]' }),
        BOX,
        line('echo', { value: '[Lumps.Islands.Count]|[Lumps.Islands.First.Count]|[Box.Islands.Count]' }),
      ),
    ).toEqual(['2|2|1']);
  });

  it('selects sharp edges by angle for Bevel Edges', () => {
    const result = solidScriptProgramRun(
      solidScriptDocumentCreate([
        BOX,
        line('select_edges', { which: 'All', of: '[Box]', where: '[=[$Edge.Angle] > 30]' }),
        line('echo', { value: '[$Selected.Edges.Count]' }),
        line('bevel_edges', { distance: '0.1' }),
        line('echo', { value: '[Box.Faces.Count]' }),
      ]),
    );
    expect(result.error?.message ?? null).toBeNull();
    expect(result.messages[0]).toBe('12');
    expect(Number(result.messages[1])).toBeGreaterThan(6);
  });
});
