import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/**
 * Groups the faces of a 3 m three-by-one grid mesh and reads the result.
 *
 * @param values Face Groups values.
 * @param after Lines after it.
 * @param echo What to print.
 * @returns Printed text, or the error.
 */
function groups(values: Record<string, string>, after: SolidScriptLine[] = [], echo = '[G.Count]'): string {
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([
      { command: 'grid_mesh', values: { size: '3, 0, 3', columns: '3', rows: '1', anchor: 'Center, Center, Center' } },
      { command: 'select_objects' },
      { command: 'select_faces', values: { which: 'All' } },
      { command: 'face_groups', values: { into: 'G', ...values } },
      ...after,
      { command: 'echo', values: { value: echo } },
    ]),
  );
  return result.error?.message ?? result.messages[0] ?? '';
}

describe('Face Groups', () => {
  it('keeps faces joined through edges in one group when no edge is cut', () => {
    expect(groups({})).toBe('1');
  });

  it('splits the groups at the edges that pass Cut', () => {
    expect(groups({ cut: '[=abs([$Edge.Center.X] + 0.5) < 0.1]' }, [], '[G.Count] [G(0).Count] [G(1).Count]')).toBe(
      '2 1 2',
    );
  });

  it('finds the edges between groups through the faces they join', () => {
    const tag: SolidScriptLine[] = [
      { command: 'tag_faces', values: { tag: 'A', of: '[G(0)]' } },
      {
        command: 'select_edges',
        values: {
          which: 'All',
          where: '[=[$Edge.Faces.Count] == 2 and [$Edge.Faces.First.Tag] != [$Edge.Faces.Last.Tag]]',
          into: 'B',
        },
      },
    ];
    expect(groups({ cut: '[=abs([$Edge.Center.X] + 0.5) < 0.1]' }, tag, '[B.Count]')).toBe('1');
  });
});
