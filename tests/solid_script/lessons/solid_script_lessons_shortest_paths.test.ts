import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/**
 * Picks the shortest paths on a 3 m three-face grid mesh from its near left
 * corner to its near right corner and reads how many edges they hold.
 *
 * @param values Extra Select Shortest Paths values.
 * @returns Edge count and summed length, or the error.
 */
function paths(values: Record<string, string>): string {
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([
      { command: 'grid_mesh', values: { size: '3, 0, 3', columns: '3', rows: '1', anchor: 'Center, Center, Center' } },
      { command: 'select_objects' },
      {
        command: 'select_shortest_paths',
        values: {
          start: '[=[$Vertex.Position.X] < -1 and [$Vertex.Position.Z] < 0]',
          end: '[=[$Vertex.Position.X] > 1 and [$Vertex.Position.Z] < 0]',
          into: 'P',
          ...values,
        },
      },
      { command: 'echo', values: { value: '[P.Count] [$Selected.Edges.Count]' } },
    ]),
  );
  return result.error?.message ?? result.messages[0] ?? '';
}

describe('Select Shortest Paths', () => {
  it('picks the fewest edges from each Start corner to the nearest End corner', () => {
    expect(paths({})).toBe('3 3');
  });

  it('follows the cheapest edges when Cost is given per edge', () => {
    expect(paths({ cost: '[=2 - [$Edge.Center.Z]]' })).toBe('5 5');
  });

  it('picks nothing when no corner is an End', () => {
    expect(paths({ end: '[=[$Vertex.Position.X] > 9]' })).toBe('0 0');
  });

  it('stops on a Cost that is not a number', () => {
    expect(paths({ cost: 'far' })).toContain('Cost');
  });
});
