import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import type { SolidScriptLine } from '@/solid_script/document/solid_script_document.js';

/** A 3 m grid mesh of three faces in a row, centred on the origin. */
const GRID: SolidScriptLine = {
  command: 'grid_mesh',
  values: { size: '3, 0, 3', columns: '3', rows: '1', anchor: 'Center, Center, Center' },
};

/**
 * Picks the shortest paths on a 3 m three-face grid mesh from its near left
 * corner to its near right corner and reads how many edges they hold.
 *
 * @param values Extra Select Shortest Paths values.
 * @param after Lines after it; with them, the count and points of the paths L
 *   are read.
 * @returns Edge count and summed length, or the error.
 */
function paths(values: Record<string, string>, after: SolidScriptLine[] = []): string {
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([
      GRID,
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
      ...after,
      {
        command: 'echo',
        values: { value: after.length ? '[L.Count] [L(0).Points.Count]' : '[P.Count] [$Selected.Edges.Count]' },
      },
    ]),
  );
  return result.error?.message ?? result.messages[0] ?? '';
}

describe('Select Shortest Paths', () => {
  it('picks the fewest edges from each Start corner to the nearest End corner, edges in line reading as one', () => {
    expect(paths({})).toBe('1 1');
  });

  it('follows the cheapest edges when Cost is given per edge', () => {
    expect(paths({ cost: '[=2 - [$Edge.Center.Z]]' })).toBe('3 3');
  });

  it('picks nothing when no corner is an End', () => {
    expect(paths({ end: '[=[$Vertex.Position.X] > 9]' })).toBe('0 0');
  });

  it('stops on a Cost that is not a number', () => {
    expect(paths({ cost: 'far' })).toContain('Cost');
  });

  it('traces the picked path once with Path From Edges', () => {
    expect(paths({ into: '' }, [{ command: 'path_from_edges', values: { into: 'L' } }])).toBe('1 4');
  });
});
