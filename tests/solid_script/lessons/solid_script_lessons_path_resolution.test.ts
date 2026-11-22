import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/** An open L-shaped path of three points, in [P]. */
const ELL: SolidScriptLine = {
  command: 'path',
  values: { shape: 'From Points', points: '[0, 0, 0], [2, 0, 0], [2, 0, 2]', into: 'P' },
};

/**
 * Runs lines after the path and prints what Echo reads.
 *
 * @param lines Lines after the path.
 * @param echo What to print.
 * @returns Printed text, or the error.
 */
function ran(lines: SolidScriptLine[], echo: string): string {
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([ELL, ...lines, { command: 'echo', values: { value: echo } }, { command: 'cube' }]),
  );
  return result.error?.message ?? result.messages[0] ?? '';
}

/**
 * Makes a Set Path Type line on [P].
 *
 * @param type Path type.
 * @param resolution Steps per stretch.
 * @returns Line.
 */
function typed(type: string, resolution: string): SolidScriptLine {
  return { command: 'set_path_type', values: { path: '[P]', type, resolution, into: 'P' } };
}

/**
 * Makes a Set Path Resolution line on [P].
 *
 * @param resolution Steps per stretch.
 * @returns Line.
 */
function resolve(resolution: string): SolidScriptLine {
  return { command: 'set_path_resolution', values: { path: '[P]', resolution, into: 'P' } };
}

describe('path resolution', () => {
  it('reads the steps each curved stretch is drawn in, 12 for a straight path', () => {
    expect(ran([], '[P.Resolution]')).toBe('12');
    expect(ran([typed('Bezier', '4')], '[P.Resolution] [P.Points.Count]')).toBe('4 9');
  });

  it('keeps the setting on a straight path without adding points', () => {
    expect(ran([resolve('5')], '[P.Resolution] [P.Points.Count]')).toBe('5 3');
  });

  it('draws a Bezier path in other steps without moving its points', () => {
    expect(ran([typed('Bezier', '4'), resolve('8')], '[P.Resolution] [P.Points.Count]')).toBe('8 17');
    expect(ran([typed('Bezier', '4'), resolve('8')], '[P.Points(0)] [P.Points(16)]')).toBe('[0, 0, 0] [2, 0, 2]');
  });

  it('draws a whole-path curve in other steps', () => {
    expect(ran([typed('Catmull Rom', '3'), resolve('6')], '[P.Resolution]')).toBe('6');
    expect(ran([typed('NURBS', '3'), resolve('5')], '[P.Resolution]')).toBe('5');
  });

  it('stops on a Resolution that is not a whole number from 1', () => {
    expect(ran([typed('Bezier', '4'), resolve('0')], '[P.Resolution]')).toContain('Resolution');
  });
});
