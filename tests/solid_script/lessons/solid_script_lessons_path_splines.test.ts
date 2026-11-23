import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/**
 * Makes [P] from points, runs Set Path Type lines on it and prints its points.
 *
 * @param points Points of the path.
 * @param types Type and Resolution of each Set Path Type line, in order.
 * @param closed True for a closed path.
 * @returns Printed points, or the error.
 */
function typed(points: string, types: [string, string][], closed = false): string {
  const lines: SolidScriptLine[] = [
    { command: 'path', values: { shape: 'From Points', points, closed: closed ? 'Yes' : 'No', into: 'P' } },
    ...types.map(([type, resolution]) => ({
      command: 'set_path_type',
      values: { path: '[P]', type, resolution, into: 'P' },
    })),
    { command: 'echo', values: { value: '[P.Points]' } },
    { command: 'cube' },
  ];
  const result = solidScriptProgramRun(solidScriptDocumentCreate(lines));
  return result.error?.message ?? result.messages[0] ?? '';
}

/** Three points of a tent. */
const TENT = '[0, 0, 0], [1, 1, 0], [2, 0, 0]';

/** Four corners of a 6 m square. */
const SQUARE = '[0, 0, 0], [6, 0, 0], [6, 6, 0], [0, 6, 0]';

describe('Set Path Type Catmull Rom and NURBS', () => {
  it('runs a Catmull Rom path through every point, its ends taking themselves as the missing neighbour', () => {
    expect(typed(TENT, [['Catmull Rom', '2']])).toBe(
      '[[0, 0, 0], [0.4375, 0.5625, 0], [1, 1, 0], [1.5625, 0.5625, 0], [2, 0, 0]]',
    );
  });

  it('keeps the shape of a Catmull Rom path made Bezier', () => {
    expect(
      typed(TENT, [
        ['Catmull Rom', '2'],
        ['Bezier', '2'],
      ]),
    ).toBe(typed(TENT, [['Catmull Rom', '2']]));
  });

  it('pins an open NURBS path to its ends and pulls it toward its other points', () => {
    expect(typed('[0, 0, 0], [1, 1, 0], [2, 1, 0], [3, 0, 0]', [['NURBS', '2']])).toBe(
      '[[0, 0, 0], [1.5, 0.75, 0], [3, 0, 0]]',
    );
  });

  it('keeps an open NURBS path of five points smooth across its inner knot', () => {
    expect(typed('[0, 0, 0], [1, 2, 0], [2, 0, 0], [3, 2, 0], [4, 0, 0]', [['NURBS', '1']])).toBe(
      '[[0, 0, 0], [2, 1, 0], [4, 0, 0]]',
    );
  });

  it('rounds a closed NURBS path inside its points with no seam', () => {
    expect(typed(SQUARE, [['NURBS', '1']], true)).toBe('[[5, 1, 0], [5, 5, 0], [1, 5, 0], [1, 1, 0]]');
  });

  it('keeps the shape of a curved path made NURBS', () => {
    expect(
      typed(TENT, [
        ['Catmull Rom', '2'],
        ['NURBS', '2'],
      ]),
    ).toBe(typed(TENT, [['Catmull Rom', '2']]));
  });

  it('gives back its points when a NURBS path is made Poly', () => {
    expect(
      typed(
        SQUARE,
        [
          ['NURBS', '4'],
          ['Poly', '1'],
        ],
        true,
      ),
    ).toBe('[[0, 0, 0], [6, 0, 0], [6, 6, 0], [0, 6, 0]]');
  });

  it('runs straight through its points when a NURBS path has fewer than four', () => {
    expect(typed(TENT, [['NURBS', '4']])).toBe('[[0, 0, 0], [1, 1, 0], [2, 0, 0]]');
  });
});
