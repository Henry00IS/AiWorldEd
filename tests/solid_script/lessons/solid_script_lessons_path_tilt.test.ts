import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/** A straight 2 m path along X, in [P]. */
const LINE: SolidScriptLine = {
  command: 'path',
  values: { shape: 'From Points', points: '[0, 0, 0], [2, 0, 0]', into: 'P' },
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
    solidScriptDocumentCreate([LINE, ...lines, { command: 'echo', values: { value: echo } }, { command: 'cube' }]),
  );
  return result.error?.message ?? result.messages[0] ?? '';
}

/** Sweeps a flat 1 m by 0.2 m bar along [P] and names the result O. */
const SWEEP: SolidScriptLine[] = [
  {
    command: 'sweep_along_path',
    values: { path: '[P]', profile: '[-0.5, 0, 0], [0.5, 0, 0], [0.5, 0.2, 0], [-0.5, 0.2, 0]', mesh: 'Yes' },
  },
  { command: 'select_objects', values: { into: 'O' } },
];

describe('Set Tilt', () => {
  it('stores a tilt per point and reads it back, 0 when never set', () => {
    expect(ran([], '[P.Tilts]')).toBe('[0, 0]');
    expect(
      ran([{ command: 'set_tilt', values: { path: '[P]', tilt: '[=[$Index] * 90]', into: 'P' } }], '[P.Tilts]'),
    ).toBe('[0, 90]');
  });

  it('blends the tilt inside curved stretches', () => {
    const bezier = { command: 'set_path_type', values: { path: '[P]', type: 'Bezier', resolution: '2', into: 'P' } };
    const tilt = { command: 'set_tilt', values: { path: '[P]', tilt: '[=[$Index] * 90]', into: 'P' } };
    expect(ran([bezier, tilt], '[P.Tilts]')).toBe('[0, 45, 90]');
  });

  it('turns a sweep by the tilt of the path', () => {
    expect(ran(SWEEP, '[O.Size]')).toBe('[2, 0.2, 1]');
    expect(ran([{ command: 'set_tilt', values: { path: '[P]', tilt: '90', into: 'P' } }, ...SWEEP], '[O.Size]')).toBe(
      '[2, 1, 0.2]',
    );
  });

  it('stops on a tilt that is not a number', () => {
    expect(ran([{ command: 'set_tilt', values: { path: '[P]', tilt: '"steep"', into: 'P' } }], '[P]')).toContain(
      'Set Tilt needs a number',
    );
  });
});
