import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/**
 * Makes an open path through points, in [P].
 *
 * @param points Points as written.
 * @returns Line.
 */
function path(points: string): SolidScriptLine {
  return { command: 'path', values: { shape: 'From Points', points, into: 'P' } };
}

/**
 * Makes a Subdivide Path line on [P].
 *
 * @param cuts Cuts field.
 * @returns Line.
 */
function subdivide(cuts: string): SolidScriptLine {
  return { command: 'subdivide_path', values: { path: '[P]', cuts, into: 'P' } };
}

/**
 * Runs lines and prints what Echo reads.
 *
 * @param lines Lines to run.
 * @param echo What to print.
 * @returns Printed text, or the error.
 */
function ran(lines: SolidScriptLine[], echo: string): string {
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([...lines, { command: 'echo', values: { value: echo } }, { command: 'cube' }]),
  );
  return result.error?.message ?? result.messages[0] ?? '';
}

/** A straight 2 m path along X. */
const LINE = path('[0, 0, 0], [2, 0, 0]');

describe('Subdivide Path', () => {
  it('cuts a straight stretch into even parts', () => {
    expect(ran([LINE, subdivide('1')], '[P.Points]')).toBe('[[0, 0, 0], [1, 0, 0], [2, 0, 0]]');
    expect(ran([LINE, subdivide('3')], '[P.Points.Count]')).toBe('5');
  });

  it('takes the cuts of each stretch from the point it starts at', () => {
    const ell = path('[0, 0, 0], [2, 0, 0], [2, 0, 2]');
    expect(ran([ell, subdivide('[=[$Index]]')], '[P.Points]')).toBe('[[0, 0, 0], [2, 0, 0], [2, 0, 1], [2, 0, 2]]');
  });

  it('cuts the closing stretch of a closed path too', () => {
    const square = { command: 'square', values: { size: '2', into: 'P' } };
    expect(ran([square, subdivide('1')], '[P.Points.Count]')).toBe('8');
  });

  it('keeps the shape of a curved path', () => {
    const bend: SolidScriptLine[] = [
      path('[0, 0, 0], [2, 0, 0]'),
      { command: 'set_path_type', values: { path: '[P]', type: 'Bezier', resolution: '200', into: 'P' } },
      {
        command: 'set_handles',
        values: { path: '[P]', right: '[=[$Point.Position] + Vector(0, 0, 2)]', resolution: '200', into: 'P' },
      },
    ];
    const before = Number(ran(bend, '[P.Length]'));
    expect(Number(ran([...bend, subdivide('2')], '[P.Length]'))).toBeCloseTo(before, 3);
    expect(ran([...bend, subdivide('1')], '[P.HandlesLeft.Count]')).toBe('3');
  });

  it('gives new points the tilt between their neighbours', () => {
    const tilt: SolidScriptLine = { command: 'set_tilt', values: { path: '[P]', tilt: '[=[$Index] * 90]', into: 'P' } };
    expect(ran([LINE, tilt, subdivide('1')], '[P.Tilts]')).toBe('[0, 45, 90]');
  });

  it('counts cuts below 0 as none, rounds them, and stops on cuts that are not a number', () => {
    expect(ran([LINE, subdivide('-1')], '[P.Points.Count]')).toBe('2');
    expect(ran([LINE, subdivide('1.4')], '[P.Points.Count]')).toBe('3');
    expect(ran([LINE, subdivide('"many"')], '[P]')).toContain('Subdivide Path');
  });
});
