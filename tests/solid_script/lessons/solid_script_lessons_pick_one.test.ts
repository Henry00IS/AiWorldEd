import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptShapeLeavesPositive } from '@/solid_script/language/solid_script_shape.js';

const END: SolidScriptLine = { command: 'end' };
const SMALL: SolidScriptLine = { command: 'cube', values: { size: '1, 1, 1', anchor: 'Center, Center, Center' } };
const BIG: SolidScriptLine = { command: 'cube', values: { size: '2, 2, 2', anchor: 'Center, Center, Center' } };
const AT = '[=List(Vector(0, 0, 0), Vector(10, 0, 0), Vector(20, 0, 0))]';

/**
 * Widths of the solids Place At Points builds, in order.
 *
 * @param values Place At Points fields.
 * @returns Widths.
 */
function widths(values: Record<string, string>): number[] {
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([
      { command: 'place_at_points', values: { at: AT, ...values } },
      SMALL,
      { command: 'variable', values: { name: 'Unused', value: '1' } },
      BIG,
      END,
    ]),
  );
  expect(result.error?.message ?? null).toBeNull();
  return result.shapes
    .flatMap(solidScriptShapeLeavesPositive)
    .flatMap((leaf) => (leaf.kind === 'solid' ? [leaf] : []))
    .map((solid) => {
      const xs = solid.points.map((point) => point.x);
      return Math.round(Math.max(...xs) - Math.min(...xs));
    });
}

describe('Place At Points Build One Line', () => {
  it('builds every line inside at each point by default', () => {
    expect(widths({})).toEqual([1, 2, 1, 2, 1, 2]);
  });

  it('builds the line Choice picks, skipping lines that only set values, and wraps', () => {
    expect(widths({ build: 'One Line', choice: '[$Index]' })).toEqual([1, 2, 1]);
    expect(widths({ build: 'One Line', choice: '-1' })).toEqual([2, 2, 2]);
  });

  it('picks at random per point by default, the same every run', () => {
    const first = widths({ build: 'One Line' });
    expect(first).toHaveLength(3);
    expect(first.every((width) => width === 1 || width === 2)).toBe(true);
    expect(widths({ build: 'One Line' })).toEqual(first);
  });
});
