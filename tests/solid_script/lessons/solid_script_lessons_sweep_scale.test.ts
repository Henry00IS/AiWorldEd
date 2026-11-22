import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptShapeLeavesPositive } from '@/solid_script/language/solid_script_shape.js';

/**
 * Heights of the ends of each solid a sweep along X builds: the Y span of its
 * corners at its smallest and largest X.
 *
 * @param values Sweep fields.
 * @returns Per solid, the height at its start and at its end; or the error.
 */
function ends(values: Record<string, string>): number[][] | string {
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([
      {
        command: 'sweep_along_path',
        values: { path: '[0, 0, 0], [1, 0, 0], [2, 0, 0]', radius: '1', sides: '4', ...values },
      },
    ]),
  );
  if (result.error) return result.error.message;
  return result.shapes
    .flatMap(solidScriptShapeLeavesPositive)
    .flatMap((leaf) => (leaf.kind === 'solid' ? [leaf] : []))
    .map((solid) => {
      const xs = solid.points.map((point) => point.x);
      const span = (x: number): number => {
        const ys = solid.points.filter((point) => Math.abs(point.x - x) < 1e-6).map((point) => point.y);
        return Math.round((Math.max(...ys) - Math.min(...ys)) * 100) / 100;
      };
      return [span(Math.min(...xs)), span(Math.max(...xs))];
    });
}

describe('Sweep Along Path Scale per point', () => {
  it('keeps the profile at Scale 1', () => {
    expect(ends({})).toEqual([
      [1.41, 1.41],
      [1.41, 1.41],
    ]);
  });

  it('sizes the profile at each path point, so the sweep tapers', () => {
    expect(ends({ scale: '[=1 - [$Index] * 0.25]' })).toEqual([
      [1.41, 1.06],
      [1.06, 0.71],
    ]);
  });

  it('stops on a Scale below 0', () => {
    expect(ends({ scale: '-1' })).toContain('Scale needs');
  });
});
