import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptGeometryLeaves } from '@/solid_script/language/solid_script_geometry.js';

/**
 * Builds a small cube at each of five points along X, filtered by Where, and
 * gives the centres of the cubes built.
 *
 * @param values Extra Place At Points values.
 * @returns X of every cube centre, sorted.
 */
function placed(values: Record<string, string>): number[] {
  const lines: SolidScriptLine[] = [
    { command: 'place_at_points', values: { at: '[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0], [4, 0, 0]', ...values } },
    { command: 'cube', values: { size: '0.2', anchor: 'Center, Center, Center' } },
    { command: 'end' },
  ];
  const result = solidScriptProgramRun(solidScriptDocumentCreate(lines));
  if (result.error) throw new Error(result.error.message);
  return solidScriptGeometryLeaves(result.shapes)
    .map((leaf) => leaf.points.reduce((sum, point) => sum + point.x, 0) / leaf.points.length)
    .sort((a, b) => a - b);
}

describe('Place At Points Where', () => {
  it('builds only at the points that pass Where', () => {
    const xs = placed({ where: '[=[$X] > 1.5]' });
    expect(xs).toHaveLength(3);
    expect(xs[0]).toBeCloseTo(2, 6);
  });

  it('keeps the original index, so other fields still count every point', () => {
    const lifted = solidScriptProgramRun(
      solidScriptDocumentCreate([
        {
          command: 'place_at_points',
          values: { at: '[0, 0, 0], [1, 0, 0], [2, 0, 0]', where: '[=[$Index] == 2]', lift: '[=[$Index]]' },
        },
        { command: 'cube', values: { size: '0.2', anchor: 'Center, Center, Center' } },
        { command: 'end' },
      ]),
    );
    if (lifted.error) throw new Error(lifted.error.message);
    const [leaf] = solidScriptGeometryLeaves(lifted.shapes);
    const y = (leaf?.points ?? []).reduce((sum, point) => sum + point.y, 0) / (leaf?.points.length ?? 1);
    expect(y).toBeCloseTo(2, 6);
  });

  it('builds at every point when Where is left off', () => {
    expect(placed({})).toHaveLength(5);
  });
});
