import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/**
 * Picks the group boundaries of one shape and echoes how many edges were
 * picked, in Into and in the selection.
 *
 * @param shape First line, such as a cube.
 * @param group Group formula.
 * @returns Echoed counts, or the error.
 */
function boundaries(shape: { command: string; values?: Record<string, string> }, group: string): string {
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([
      shape,
      { command: 'select_objects' },
      { command: 'select_group_boundaries', values: { group, into: 'E' } },
      { command: 'echo', values: { value: '[E.Count] [$Selected.Edges.Count]' } },
    ]),
  );
  return result.error?.message ?? result.messages[0] ?? '';
}

const cube = { command: 'cube' };
const strip = {
  command: 'grid_mesh',
  values: { size: '3, 0, 3', columns: '3', rows: '1', anchor: 'Center, Center, Center' },
};

describe('Select Group Boundaries', () => {
  it('picks the edges between faces of different groups', () => {
    expect(boundaries(cube, '[=[$Face.Normal.Y] > 0.9]')).toBe('4 4');
    expect(boundaries(cube, '[=[$Face.Normal]]')).toBe('12 12');
  });

  it('picks nothing when every face is in one group', () => {
    expect(boundaries(cube, '[=1]')).toBe('0 0');
  });

  it('never picks an edge with only one face', () => {
    expect(boundaries(strip, '[=[$Face.Center.X] > 0.5]')).toBe('1 1');
    expect(boundaries(strip, '[=[$Face.Center.X]]')).toBe('2 2');
  });
});
