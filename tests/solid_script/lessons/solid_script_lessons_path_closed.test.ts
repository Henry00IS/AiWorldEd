import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/** An open L-shaped path of three points, in [P]. */
const ELL: SolidScriptLine = {
  command: 'path_from_points',
  values: { points: '[0, 0, 0], [2, 0, 0], [2, 0, 2]', into: 'P' },
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
 * Makes a Set Path Closed line on [P].
 *
 * @param closed Yes or No.
 * @returns Line.
 */
function close(closed: string): SolidScriptLine {
  return { command: 'set_path_closed', values: { path: '[P]', closed, into: 'P' } };
}

describe('Set Path Closed', () => {
  it('joins the last point back to the first, and opens it again', () => {
    expect(ran([], '[P.Closed]')).toBe('No');
    expect(ran([close('Yes')], '[P.Closed]')).toBe('Yes');
    expect(Number(ran([close('Yes')], '[P.Length]'))).toBeCloseTo(4 + Math.hypot(2, 2), 6);
    expect(ran([close('Yes'), close('No')], '[P.Length]')).toBe('4');
  });

  it('keeps the tilts and the curve kind of the path', () => {
    const tilt: SolidScriptLine = { command: 'set_tilt', values: { path: '[P]', tilt: '[=[$Index] * 10]', into: 'P' } };
    expect(ran([tilt, close('Yes')], '[P.Tilts]')).toContain('20');
    const nurbs: SolidScriptLine = { command: 'set_path_type', values: { path: '[P]', type: 'NURBS', into: 'P' } };
    expect(ran([nurbs, close('Yes')], '[P.Closed]')).toBe('Yes');
  });

  it('stops on a Closed that is not Yes or No', () => {
    expect(ran([close('"sometimes"')], '[P]')).toContain('Set Path Closed');
  });
});
