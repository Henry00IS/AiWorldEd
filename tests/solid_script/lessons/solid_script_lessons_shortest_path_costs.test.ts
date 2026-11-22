import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/**
 * Picks the shortest paths on a 3 m three-face grid mesh, one face deep, to its
 * near right corner and echoes what the per-corner lists hold.
 *
 * @param values Extra Select Shortest Paths values.
 * @param echo Text to echo afterwards, reading the lists N and C.
 * @returns The echoed text, or the error.
 */
function corners(values: Record<string, string>, echo: string): string {
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([
      { command: 'grid_mesh', values: { size: '3, 0, 3', columns: '3', rows: '1', anchor: 'Center, Center, Center' } },
      { command: 'select_objects' },
      {
        command: 'select_shortest_paths',
        values: { end: '[=[$Vertex.Position.X] > 1 and [$Vertex.Position.Z] < 0]', nexts: 'N', costs: 'C', ...values },
      },
      { command: 'echo', values: { value: echo } },
    ]),
  );
  return result.error?.message ?? result.messages[0] ?? '';
}

describe('Select Shortest Paths per corner', () => {
  it('writes the total cost from every corner to its nearest End', () => {
    expect(corners({}, '[C.Count] [=Sum([C])] [=Max([C])]')).toBe('8 16 4');
    expect(corners({ cost: '[=[$Edge.Length]]' }, '[=Sum([C])] [=Max([C])]')).toBe('48 12');
  });

  it('writes the next corner of every corner, an End corner pointing at itself', () => {
    expect(corners({}, '[N] | [C]')).toBe('[1, 2, 3, 3, 0, 1, 2, 3] | [3, 2, 1, 0, 4, 3, 2, 1]');
  });

  it('writes 0 cost and the corner itself where no End is reachable', () => {
    expect(corners({ end: '[=[$Vertex.Position.X] > 9]' }, '[=Sum([C])] [=Sum([N])]')).toBe('0 28');
  });
});
