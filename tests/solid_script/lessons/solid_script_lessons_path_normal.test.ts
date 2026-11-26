import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/** A straight 2 m path along X, in [P]. */
const LINE: SolidScriptLine = {
  command: 'path_from_points',
  values: { points: '[0, 0, 0], [2, 0, 0]', into: 'P' },
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

/** A fixed Free normal facing the scene's depth axis. */
const FREE: SolidScriptLine = {
  command: 'set_path_normal',
  values: { path: '[P]', normal: '0, 0, 2', into: 'P' },
};

describe('Set Path Normal', () => {
  it('stores the up side on the path and lets Minimum Twist reset it', () => {
    expect(ran([FREE], '[P.Normals]')).toBe('[[0, 0, 1], [0, 0, 1]]');
    expect(
      ran(
        [FREE, { command: 'set_path_normal_mode', values: { path: '[P]', mode: 'Minimum Twist', into: 'P' } }],
        '[P.Normals]',
      ),
    ).toBe('[[0, 1, 0], [0, 1, 0]]');
  });

  it('uses the stored up side for a sweep unless Up overrides it', () => {
    expect(ran([FREE, ...SWEEP], '[O.Size]')).toBe('[2, 1, 0.2]');
    const sweep = { ...SWEEP[0]!, values: { ...SWEEP[0]!.values, up: '0, 1, 0' } };
    expect(ran([FREE, sweep, SWEEP[1]!], '[O.Size]')).toBe('[2, 0.2, 1]');
  });

  it('interpolates curved normals and retains them through subdivision and rotation', () => {
    const bezier = { command: 'set_path_type', values: { path: '[P]', type: 'Bezier', resolution: '2', into: 'P' } };
    expect(ran([FREE, bezier], '[P.Normals]')).toBe('[[0, 0, 1], [0, 0, 1], [0, 0, 1]]');
    const subdivide = { command: 'subdivide_path', values: { path: '[P]', cuts: '1', into: 'P' } };
    expect(ran([FREE, subdivide], '[P.Normals]')).toBe('[[0, 0, 1], [0, 0, 1], [0, 0, 1]]');
    const turn = { command: 'rotate_by', values: { of: '[P]', by: '90, 0, 0' } };
    expect(ran([FREE, turn], '[P.Normals]')).toBe('[[0, -1, 0], [0, -1, 0]]');
  });

  it('rejects a zero Free normal', () => {
    expect(ran([{ ...FREE, values: { ...FREE.values, normal: '0, 0, 0' } }], '[P.Normals]')).toContain('not 0, 0, 0');
  });

  it('keeps Set Path Normal Mode to Minimum Twist and Up, and stops on any other word', () => {
    const mode = (word: string): SolidScriptLine => ({
      command: 'set_path_normal_mode',
      values: { path: '[P]', mode: word, into: 'P' },
    });
    expect(ran([FREE, mode('Up')], '[P.Normals]')).toBe('[[0, 1, 0], [0, 1, 0]]');
    expect(ran([mode('Free')], '[P.Normals]')).toContain('Minimum Twist');
  });
});
