import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/**
 * Scales edges of a 2 m two-face grid mesh and reads its size.
 *
 * @param values Scale Edges values.
 * @returns Size of the grid, or the error.
 */
function size(values: Record<string, string>): string {
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([
      { command: 'grid_mesh', values: { size: '2, 0, 2', columns: '2', rows: '1', anchor: 'Center, Center, Center' } },
      { command: 'select_objects', values: { into: 'G' } },
      { command: 'scale_edges', values },
      { command: 'echo', values: { value: '[G(0).Size]' } },
    ]),
  );
  return result.error?.message ?? result.messages[0] ?? '';
}

describe('Scale Edges', () => {
  it('scales a joined chain of edges as one island about the middle of their midpoints', () => {
    expect(size({ factor: '0.5', where: '[$Edge.IsBoundary]' })).toBe('[1, 0, 1]');
  });

  it('scales only along Axis', () => {
    expect(size({ factor: '0.5', axis: '1, 0, 0', where: '[$Edge.IsBoundary]' })).toBe('[1, 0, 2]');
  });

  it('scales edges that share no corner about their own midpoints', () => {
    expect(size({ factor: '0', where: '[=abs([$Edge.Center.X]) > 0.9]' })).toBe('[2, 0, 2]');
  });

  it('stops on a Factor that is not a number', () => {
    expect(size({ factor: 'big' })).toContain('Factor');
  });
});
