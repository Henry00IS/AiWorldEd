import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import type { SolidScriptUseFacts } from '@/solid_script/language/solid_script_system.js';
import { solidScriptGeometryLeaves } from '@/solid_script/language/solid_script_geometry.js';
import * as THREE from 'three';

/** Corners of a box of a size, centered on the origin. */
function box(size: number): [number, number, number][] {
  const corners: [number, number, number][] = [];
  for (const x of [-1, 1])
    for (const y of [-1, 1]) for (const z of [-1, 1]) corners.push([x * size, y * size, z * size]);
  return corners.map(([x, y, z]) => [x / 2, y / 2, z / 2]);
}

/** A modifier receiving one 2 m cube. */
const USE: SolidScriptUseFacts = { usage: 'Modifier', solids: [box(2)], faces: 6 };

const line = (command: string, values: Record<string, string> = {}): SolidScriptLine => ({ command, values });
const END = line('end');
const CUBE = line('cube', { size: '0.1, 0.1, 0.1', anchor: 'Center, Center, Center' });

/** Henry's script from t121u, with Move split into Move By. */
const HENRY: SolidScriptLine[] = [
  line('select_brushes', { which: 'New', how: 'New' }),
  line('select_faces', { which: 'Facing Up', how: 'New' }),
  line('select_edges', { which: 'All', how: 'New' }),
  line('points_from_edges', { into: 'Points' }),
  line('for_each', { variable: 'Point', list: '[Points]' }),
  CUBE,
  line('select_brushes', { which: 'New', how: 'Add' }),
  line('move_by', { by: '1, 1, 1' }),
  END,
];

/**
 * Runs lines, as a modifier when given what it receives.
 *
 * @param lines Lines.
 * @param use What a modifier receives.
 * @returns Run result.
 */
function run(lines: SolidScriptLine[], use?: SolidScriptUseFacts) {
  return solidScriptProgramRun(solidScriptDocumentCreate(lines), use ? { use } : {});
}

/**
 * Rounded centers of the solids a run built, sorted by distance from the origin
 * so a staircase is easy to read.
 *
 * @param lines Lines.
 * @param use What a modifier receives.
 * @returns Centers as [x, y, z] metres.
 */
function centers(lines: SolidScriptLine[], use?: SolidScriptUseFacts): number[][] {
  const result = run(lines, use);
  expect(result.error?.message ?? null).toBeNull();
  const round = (value: number): number => Math.round(value * 1000) / 1000 + 0;
  return solidScriptGeometryLeaves(result.shapes)
    .map((leaf) => {
      const center = leaf.points
        .reduce((sum, point) => sum.add(point), new THREE.Vector3())
        .divideScalar(leaf.points.length);
      return [round(center.x), round(center.y), round(center.z)];
    })
    .sort((left, right) => left[0]! + left[1]! + left[2]! - (right[0]! + right[1]! + right[2]!));
}

/**
 * Script that makes four 0.1 m cubes in a loop, then picks and moves them.
 *
 * @param which Select Brushes Which.
 * @param how Select Brushes How.
 * @returns Lines.
 */
function loopSelect(which: string, how: string): SolidScriptLine[] {
  return [
    line('repeat', { from: '1', to: '4' }),
    CUBE,
    line('select_brushes', { which, how }),
    line('move_by', { by: '1, 1, 1' }),
    END,
  ];
}

describe('SolidScript Select and Move By in a loop', () => {
  it('moves each new 0.1 m cube by a literal 1, 1, 1 metres in the New Add loop', () => {
    // Each For Each round starts from the pick made before the loop (the input
    // brush), so How Add cannot pile cubes up across rounds. Every new cube
    // still moves a full metre, not a fraction of its 0.1 m size.
    expect(centers(HENRY, USE)).toEqual([
      [1, 1, 1],
      [1, 1, 1],
      [1, 1, 1],
      [1, 1, 1],
    ]);
  });

  it('moves every cube a full metre in All New and All Add loops, each round on its own', () => {
    // A For Each or Repeat round only picks what that round built, and the
    // pick from before the loop comes back after, so cubes from earlier
    // rounds are not added in. Each 0.1 m cube still moves a literal metre.
    const stacked = [
      [1, 1, 1],
      [1, 1, 1],
      [1, 1, 1],
      [1, 1, 1],
    ];
    expect(centers(loopSelect('All', 'New'))).toEqual(stacked);
    expect(centers(loopSelect('All', 'Add'))).toEqual(stacked);
    expect(
      centers(
        [
          line('select_brushes', { which: 'New', how: 'New' }),
          line('select_faces', { which: 'Facing Up', how: 'New' }),
          line('select_edges', { which: 'All', how: 'New' }),
          line('points_from_edges', { into: 'Points' }),
          line('for_each', { variable: 'Point', list: '[Points]' }),
          CUBE,
          line('select_brushes', { which: 'All', how: 'New' }),
          line('move_by', { by: '1, 1, 1' }),
          END,
        ],
        USE,
      ),
    ).toEqual(stacked);
  });

  it('lets How Remove drop new cubes in the same round, and Select Edges New Add pick later edges', () => {
    const printed = (lines: SolidScriptLine[]): string[] => {
      const result = run(lines);
      expect(result.error?.message ?? null).toBeNull();
      return result.messages;
    };
    expect(
      printed([
        line('cube', { anchor: 'Center, Center, Center' }),
        line('select_brushes', { which: 'All', how: 'New', into: 'First' }),
        line('cube', { anchor: 'Center, Center, Center' }),
        line('select_brushes', { which: 'New', how: 'Remove', into: 'Left' }),
        line('echo', { value: '[First.Count] [Left.Count] [$Selected.Brushes.Count]' }),
      ]),
    ).toEqual(['1 1 1']);
    expect(
      printed([
        line('cube', { anchor: 'Center, Center, Center' }),
        line('select_brushes', { which: 'All', how: 'New' }),
        line('select_edges', { which: 'All', how: 'New', into: 'First' }),
        line('cube', { anchor: 'Center, Center, Center' }),
        line('select_brushes', { which: 'New', how: 'New' }),
        line('select_edges', { which: 'New', how: 'Add', into: 'Both' }),
        line('echo', { value: '[First.Count] [Both.Count]' }),
      ]),
    ).toEqual(['12 24']);
  });
});
