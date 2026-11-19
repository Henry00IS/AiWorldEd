import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptGeometryLeaves } from '@/solid_script/language/solid_script_geometry.js';
import type { SolidScriptShapeSolid } from '@/solid_script/language/solid_script_shape.js';

const END: SolidScriptLine = { command: 'end' };
const CUBE: SolidScriptLine = { command: 'cube', values: { size: '2, 2, 2', anchor: 'Center, Center, Center' } };
const SELECT_BRUSHES: SolidScriptLine = { command: 'select_brushes' };

/**
 * Runs script lines.
 *
 * @param lines Lines.
 * @returns Run result.
 */
function run(...lines: SolidScriptLine[]) {
  return solidScriptProgramRun(solidScriptDocumentCreate(lines));
}

/**
 * First solid in a run, or every solid when listing them.
 *
 * @param lines Lines.
 * @returns Solids.
 */
function solids(...lines: SolidScriptLine[]): SolidScriptShapeSolid[] {
  const result = run(...lines);
  expect(result.error?.message ?? null).toBeNull();
  return solidScriptGeometryLeaves(result.shapes).filter(
    (leaf): leaf is SolidScriptShapeSolid => leaf.kind === 'solid',
  );
}

/**
 * Y of the highest corner of a solid.
 *
 * @param solid Solid.
 * @returns Max Y.
 */
function maxY(solid: SolidScriptShapeSolid): number {
  return Math.max(...solid.points.map((point) => point.y));
}

describe('SolidScript tools with Into', () => {
  it('clips in place when Into is empty', () => {
    const [solid] = solids(CUBE, SELECT_BRUSHES, {
      command: 'clip',
      values: { through: '0, 0, 0', normal: '0, 1, 0' },
    });
    if (!solid) throw new Error('Expected a clipped cube');
    expect(maxY(solid)).toBeCloseTo(0, 5);
  });

  it('leaves the original and keeps the clipped copy in the variable when Into is set', () => {
    const result = run(
      CUBE,
      { command: 'select_brushes' },
      { command: 'clip', values: { through: '0, 0, 0', normal: '0, 1, 0', into: 'Cut' } },
      { command: 'echo', values: { value: '[=[Cut.Count]] [=[Cut(0).Max.Y]]' } },
    );
    expect(result.error?.message ?? null).toBeNull();
    const [solid] = solidScriptGeometryLeaves(result.shapes).filter(
      (leaf): leaf is SolidScriptShapeSolid => leaf.kind === 'solid',
    );
    if (!solid) throw new Error('Expected the original cube in the scene');
    expect(maxY(solid)).toBeCloseTo(1, 5);
    expect(result.messages).toEqual(['1 0']);
  });

  it('puts an extruded slab in the scene without Into, and only in the variable with Into', () => {
    const inPlace = solids(
      CUBE,
      { command: 'select_brushes' },
      { command: 'select_faces', values: { which: 'Up' } },
      { command: 'select_brushes' },
      { command: 'extrude_face', values: { distance: '0.5' } },
    );
    expect(inPlace).toHaveLength(2);
    const copied = run(
      CUBE,
      { command: 'select_brushes' },
      { command: 'select_faces', values: { which: 'Up' } },
      { command: 'select_brushes' },
      { command: 'extrude_face', values: { distance: '0.5', into: 'Slab' } },
      { command: 'echo', values: { value: '[=[Slab.Count]]' } },
    );
    expect(copied.error?.message ?? null).toBeNull();
    expect(solidScriptGeometryLeaves(copied.shapes)).toHaveLength(1);
    expect(copied.messages).toEqual(['1']);
  });

  it('keeps an in-place edit of a Part in memory, so only Output puts it in the scene', () => {
    const hidden = solids({ command: 'part', values: { name: 'Block' } }, CUBE, END, {
      command: 'clip',
      values: { of: '[Block]', through: '0, 0, 0', normal: '0, 1, 0' },
    });
    expect(hidden).toHaveLength(0);
    const shown = solids(
      { command: 'part', values: { name: 'Block' } },
      CUBE,
      END,
      { command: 'clip', values: { of: '[Block]', through: '0, 0, 0', normal: '0, 1, 0' } },
      { command: 'output', values: { of: '[Block]' } },
    );
    expect(shown).toHaveLength(1);
    const block = shown[0];
    if (!block) throw new Error('Expected the clipped part in the scene');
    expect(maxY(block)).toBeCloseTo(0, 5);
  });
});
