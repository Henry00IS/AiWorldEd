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
 * Makes a Set Handle Type line on [P].
 *
 * @param values Type, Side and Pick Where.
 * @returns Line.
 */
function typed(values: Record<string, string>): SolidScriptLine {
  return { command: 'set_handle_type', values: { path: '[P]', into: 'P', ...values } };
}

describe('path handle types', () => {
  it('reads the handle type on each side of every control point', () => {
    expect(ran([typed({ type: 'Auto' })], '[P.HandleTypesLeft] [P.HandleTypesRight]')).toBe(
      '[Auto, Auto, Auto] [Auto, Auto, Auto]',
    );
  });

  it('sets just one side of just the picked points, leaving the others as they were', () => {
    expect(
      ran(
        [typed({ type: 'Auto' }), typed({ type: 'Vector', side: 'Left', pick: '[=[$Index] == 1]' })],
        '[P.HandleTypesLeft] [P.HandleTypesRight]',
      ),
    ).toBe('[Auto, Vector, Auto] [Auto, Auto, Auto]');
  });

  it('picks points by their handle type', () => {
    const first = typed({ type: 'Auto', pick: '[=[$Index] != 1]' });
    const picked = typed({ type: 'Align', pick: '[=[P.HandleTypesLeft([$Index])] == "Auto"]' });
    expect(ran([first, picked], '[P.HandleTypesLeft]')).toBe('[Align, Free, Align]');
  });

  it('gives a straight path made Bezier Vector handles', () => {
    const bezier: SolidScriptLine = { command: 'set_path_type', values: { path: '[P]', type: 'Bezier', into: 'P' } };
    expect(ran([bezier], '[P.HandleTypesLeft]')).toBe('[Vector, Vector, Vector]');
  });

  it('keeps types through changing the resolution, closing and tilts', () => {
    const resolution: SolidScriptLine = {
      command: 'set_path_resolution',
      values: { path: '[P]', resolution: '4', into: 'P' },
    };
    expect(ran([typed({ type: 'Align' }), resolution], '[P.HandleTypesRight]')).toBe('[Align, Align, Align]');
  });

  it('makes new handles Align when a Bezier stretch is subdivided', () => {
    const cut: SolidScriptLine = { command: 'subdivide_path', values: { path: '[P]', cuts: '1', into: 'P' } };
    expect(ran([typed({ type: 'Auto' }), cut], '[P.HandleTypesLeft] [P.HandleTypesRight]')).toBe(
      '[Auto, Align, Align, Align, Align] [Align, Align, Align, Align, Auto]',
    );
  });
});
