import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptShapeLeavesPositive } from '@/solid_script/language/solid_script_shape.js';

const END: SolidScriptLine = { command: 'end' };
const BEAM: SolidScriptLine = { command: 'cube', values: { size: '0.5, 1, 4', anchor: 'Center, Center, Center' } };

/**
 * Sizes along X, Y and Z of every solid a script builds, rounded.
 *
 * @param lines Lines.
 * @returns One size per solid.
 */
function sizes(...lines: SolidScriptLine[]): number[][] {
  const result = solidScriptProgramRun(solidScriptDocumentCreate(lines));
  expect(result.error?.message ?? null).toBeNull();
  return result.shapes
    .flatMap(solidScriptShapeLeavesPositive)
    .flatMap((leaf) => (leaf.kind === 'solid' ? [leaf] : []))
    .map((solid) =>
      (['x', 'y', 'z'] as const).map((axis) => {
        const along = solid.points.map((point) => point[axis]);
        return Math.round((Math.max(...along) - Math.min(...along)) * 100) / 100;
      }),
    );
}

describe('Forward next to up', () => {
  it('turns the front of each copy of Place At Points toward Forward', () => {
    const place = (values: Record<string, string>): SolidScriptLine => ({
      command: 'place_at_points',
      values: { at: '0, 0, 0', ...values },
    });
    expect(sizes(place({}), BEAM, END)).toEqual([[0.5, 1, 4]]);
    expect(sizes(place({ forward: '1, 0, 0' }), BEAM, END)).toEqual([[4, 1, 0.5]]);
    expect(sizes(place({ directions: '0, 0, 1', forward: '1, 0, 0' }), BEAM, END)).toEqual([[4, 0.5, 1]]);
  });

  it('lays Forward square to up, and keeps the plain turn when Forward runs along up', () => {
    const place = (forward: string): SolidScriptLine => ({
      command: 'place_at_points',
      values: { at: '0, 0, 0', forward },
    });
    expect(sizes(place('1, 5, 0'), BEAM, END)).toEqual([[4, 1, 0.5]]);
    expect(sizes(place('0, 3, 0'), BEAM, END)).toEqual([[0.5, 1, 4]]);
  });

  it('works Forward out per point', () => {
    const place: SolidScriptLine = {
      command: 'place_at_points',
      values: { at: '[0, 0, 0], [10, 0, 0]', forward: '[=Vector([$Index], 0, 1 - [$Index])]' },
    };
    expect(sizes(place, BEAM, END)).toEqual([
      [0.5, 1, 4],
      [4, 1, 0.5],
    ]);
  });

  it('gives Align To a Forward', () => {
    const lines = (values: Record<string, string>): SolidScriptLine[] => [
      BEAM,
      { command: 'select_objects' },
      { command: 'align', values: { direction: '0, 1, 0', ...values } },
    ];
    expect(sizes(...lines({}))).toEqual([[0.5, 1, 4]]);
    expect(sizes(...lines({ forward: '1, 0, 0' }))).toEqual([[4, 1, 0.5]]);
    expect(sizes(...lines({ direction: '1, 0, 0', forward: '0, 1, 0' }))).toEqual([[1, 4, 0.5]]);
  });
});
