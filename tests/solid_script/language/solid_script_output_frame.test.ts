import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptGeometryLeaves } from '@/solid_script/language/solid_script_geometry.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

const PLACE: SolidScriptLine = { command: 'place_at_points', values: { at: '[=[Vector(5, 0, 0), Vector(0, 5, 0)]]' } };
const END: SolidScriptLine = { command: 'end' };

/**
 * Runs lines and gives the middle of every solid or mesh made.
 *
 * @param lines Script.
 * @returns Middles, rounded, as text.
 */
function middles(lines: SolidScriptLine[]): string[] {
  const result = solidScriptProgramRun(solidScriptDocumentCreate(lines));
  if (result.error) throw new Error(result.error.message);
  return solidScriptGeometryLeaves(result.shapes).map((leaf) => {
    const middle = leaf.points
      .reduce((sum, point) => sum.add(point), new THREE.Vector3())
      .divideScalar(leaf.points.length);
    return middle
      .toArray()
      .map((axis) => Math.round(axis * 100) / 100)
      .join(', ');
  });
}

describe('Output keeps objects where their block built them', () => {
  it('stamps a cube held in Into on its point, like a cube built straight in the block', () => {
    const cube: SolidScriptLine = { command: 'cube', values: { size: '2, 1, 1', anchor: 'Center, Center, Center' } };
    const direct = middles([PLACE, cube, END]);
    expect(direct).toEqual(['5, 0, 0', '0, 5, 0']);
    const held = middles([
      PLACE,
      { ...cube, values: { ...cube.values, into: 'Window' } },
      { command: 'bevel_edges', values: { distance: '0.1', of: '[Window]' } },
      { command: 'output', values: { of: '[Window]' } },
      END,
    ]);
    expect(held).toEqual(direct);
  });

  it('still moves objects built outside the block', () => {
    expect(
      middles([
        { command: 'cube', values: { anchor: 'Center, Center, Center', into: 'Post' } },
        { command: 'transform', values: { move: '2, 0, 0' } },
        { command: 'output', values: { of: '[Post]' } },
        END,
      ]),
    ).toEqual(['2, 0, 0']);
  });

  it('moves only by the blocks the object was not built in', () => {
    expect(
      middles([
        { command: 'transform', values: { move: '0, 0, 3' } },
        { command: 'cube', values: { anchor: 'Center, Center, Center', into: 'Post' } },
        { command: 'transform', values: { move: '2, 0, 0' } },
        { command: 'output', values: { of: '[Post]' } },
        END,
        END,
      ]),
    ).toEqual(['2, 0, 3']);
  });
});
