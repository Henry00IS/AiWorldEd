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

/** Henry's t121u script, with Move split into Move By. */
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
 * Rounded centers of the solids a run built, sorted from the origin out.
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

describe('SolidScript Select and Move By in a loop', () => {
  it('narrows Select Faces to the picked brushes, and Select Edges with empty Of to those faces', () => {
    const result = run([
      line('cube', { size: '2, 2, 2', anchor: 'Center, Center, Center' }),
      line('select_brushes', { which: 'New', how: 'New' }),
      line('echo', { value: 'brushes [$Selected.Brushes.Count] faces [$Selected.Faces.Count]' }),
      line('select_faces', { which: 'Facing Up', how: 'New' }),
      line('echo', { value: 'faces [$Selected.Faces.Count] edges [$Selected.Edges.Count]' }),
      line('select_edges', { which: 'All', how: 'New' }),
      line('echo', { value: 'edges [$Selected.Edges.Count]' }),
      line('points_from_edges', { into: 'Points' }),
      line('echo', { value: 'points [Points.Count]' }),
    ]);
    expect(result.error?.message ?? null).toBeNull();
    expect(result.messages).toEqual(['brushes 1 faces 0', 'faces 1 edges 0', 'edges 4', 'points 4']);
  });

  it("builds a 1 m staircase from Henry's New Add loop, and does not place cubes at [Point]", () => {
    // The four 0.1 m cubes all start at the origin (the Cube line does not
    // use [Point]), then each Move By 1, 1, 1 moves every already picked
    // brush. The input brush stays in the pick from the Select Brushes
    // before the loop, but is not outputted without an Input Brushes line.
    expect(centers(HENRY, USE)).toEqual([
      [1, 1, 1],
      [2, 2, 2],
      [3, 3, 3],
      [4, 4, 4],
    ]);
  });

  it('keeps the received brush in the pick and moves it 4 m, even though it is not outputted', () => {
    const result = run(
      [
        ...HENRY,
        line('for_each', { variable: 'Brush', list: '[$Selected.Brushes]' }),
        line('echo', { value: '[Brush.Size] at [Brush.Center]' }),
        END,
      ],
      USE,
    );
    expect(result.error?.message ?? null).toBeNull();
    expect(result.messages).toEqual([
      '[2, 2, 2] at [4, 4, 4]',
      '[0.1, 0.1, 0.1] at [4, 4, 4]',
      '[0.1, 0.1, 0.1] at [3, 3, 3]',
      '[0.1, 0.1, 0.1] at [2, 2, 2]',
      '[0.1, 0.1, 0.1] at [1, 1, 1]',
    ]);
    expect(centers(HENRY, USE)).toEqual([
      [1, 1, 1],
      [2, 2, 2],
      [3, 3, 3],
      [4, 4, 4],
    ]);
  });

  it('lets the pick grow from round to round, and stay after the loop', () => {
    const result = run(
      [
        line('select_brushes', { which: 'New', how: 'New' }),
        line('for_each', { variable: 'Point', list: '0, 1, 2, 3' }),
        CUBE,
        line('select_brushes', { which: 'New', how: 'Add' }),
        line('echo', { value: '[$Selected.Brushes.Count]' }),
        END,
        line('echo', { value: 'after [$Selected.Brushes.Count]' }),
      ],
      USE,
    );
    expect(result.error?.message ?? null).toBeNull();
    expect(result.messages).toEqual(['2', '3', '4', '5', 'after 5']);
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
