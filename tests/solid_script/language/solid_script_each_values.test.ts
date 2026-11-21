import { describe, expect, it } from 'vitest';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import { solidScriptParameterEachFills } from '@/solid_script/commands/solid_script_command_each.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

const line = (command: string, values: Record<string, string> = {}): SolidScriptLine => ({ command, values });

/**
 * A cube of size 2 with its middle at a point.
 *
 * @param x Middle on X.
 * @returns Lines that build it.
 */
function cubeAt(x: number): SolidScriptLine[] {
  return [
    line('cube', { size: '2, 2, 2', anchor: 'Center, Center, Center', label: `C${x}` }),
    line('move_by', { by: `${x}, 0, 0`, of: `C${x}` }),
  ];
}

/**
 * Runs lines and returns what they printed, or the error.
 *
 * @param lines Script lines.
 * @returns Messages, or a one-item list of the error.
 */
function printed(...lines: SolidScriptLine[]): string[] {
  const result = solidScriptProgramRun(solidScriptDocumentCreate(lines), {});
  return result.error ? [result.error.message] : result.messages;
}

/**
 * Counts the faces Select Faces keeps with a Where, on two cubes side by side.
 *
 * @param where Where formula.
 * @returns What Echo printed.
 */
function facesKept(where: string): string[] {
  return printed(
    ...cubeAt(0),
    ...cubeAt(5),
    line('select_objects'),
    line('select_faces', { which: 'All', where }),
    line('echo', { value: '[$Selected.Faces.Count]' }),
  );
}

describe('SolidScript per-item values', () => {
  it('gives every kind of item $Index, $Count and the $X short forms', () => {
    for (const kind of ['Object', 'Face', 'Edge', 'Vertex', 'Point', 'Item'] as const) {
      const fills = solidScriptParameterEachFills(kind);
      expect(fills).toEqual(expect.arrayContaining([`$${kind}`, '$Index', '$Count', '$X', '$Y', '$Z']));
    }
    for (const kind of ['Face', 'Vertex', 'Point'] as const)
      expect(solidScriptParameterEachFills(kind)).toEqual(expect.arrayContaining(['$NX', '$NY', '$NZ']));
  });

  it('counts $Index of Select Faces through the whole list, with $Count the list size', () => {
    expect(facesKept('[=[$Index] == 6]')).toEqual(['1']);
    expect(facesKept('[=[$Count] == 12]')).toEqual(['12']);
  });

  it('reads $X, $Y and $Z of a face as its center, the same as [$Face.Center]', () => {
    expect(facesKept('[=[$Y] > 0.5]')).toEqual(['2']);
    expect(facesKept('[=[$X] > 5.5]')).toEqual(facesKept('[=[$Face.Center.X] > 5.5]'));
    expect(facesKept('[=[$NY] > 0.5]')).toEqual(['2']);
  });

  it('no longer knows $CX, $CY and $CZ', () => {
    expect(facesKept('[=[$CY] > 0]')[0]).toMatch(/CY/);
    expect(solidScriptCommandFind('select_faces')?.fills).not.toContain('$CX');
  });

  it('reads $X of an edge and a brush as its center', () => {
    const edges = printed(
      ...cubeAt(0),
      line('select_objects'),
      line('select_edges', { which: 'All', where: '[=[$Y] > 0.5]', into: 'Top' }),
      line('echo', { value: '[Top.Count]' }),
    );
    expect(edges).toEqual(['4']);
    const brushes = printed(
      ...cubeAt(0),
      ...cubeAt(5),
      line('select_objects', { which: 'All', where: '[=[$X] > 2]', into: 'Right' }),
      line('echo', { value: '[Right.Count]' }),
    );
    expect(brushes).toEqual(['1']);
  });

  it('reads $X of a vector item in Filter List', () => {
    expect(
      printed(
        line('filter_list', { list: '[1, 2, 3], [-1, 0, 0], [4, 0, 0]', where: '[=[$X] > 0]', into: 'Kept' }),
        line('echo', { value: '[Kept.Count]' }),
      ),
    ).toEqual(['2']);
  });

  it('makes $Point a Point with a Position and the Normal from Directions', () => {
    const sideways = printed(
      line('place_at_points', {
        at: '[0, 0, 0], [5, 0, 0]',
        directions: '[0, 1, 0], [1, 0, 0]',
        scale: '[=Vector(1, 1, 1 + [$NY])]',
        into: 'Placed',
      }),
      line('cube', { size: '1, 1, 1' }),
      line('end'),
      line('echo', { value: '[Placed.Sizes]' }),
    );
    expect(sideways).toEqual(['[[1, 1, 2], [1, 1, 1]]']);
    const scaled = printed(
      line('place_at_points', {
        at: '[0, 0, 0], [5, 0, 0]',
        directions: '[0, 1, 0], [0, 1, 0]',
        scale: '[=Vector(1 + [$Point.Normal.Y], 1 + [$NY], 1 + [$Point.Position.X] / 5)]',
        into: 'Placed',
      }),
      line('cube', { size: '1, 1, 1' }),
      line('end'),
      line('echo', { value: '[Placed.Sizes]' }),
    );
    expect(scaled).toEqual(['[[2, 2, 1], [2, 2, 2]]']);
  });

  it('lets Displace read [$Vertex.Position] the same as [$Y]', () => {
    const mesh = (distance: string): string[] =>
      printed(
        line('mesh_from_solids', { into: 'M' }),
        line('cube', { size: '2, 2, 2', anchor: 'Center, Center, Center' }),
        line('end'),
        line('displace', { distance, of: '[M]' }),
        line('echo', { value: '[M.Size]' }),
      );
    expect(mesh('[=[$Vertex.Position.Y] * 0.5]')).toEqual(mesh('[=[$Y] * 0.5]'));
    expect(mesh('[=[$Count] * 0]')).toEqual(mesh('0'));
  });
});
