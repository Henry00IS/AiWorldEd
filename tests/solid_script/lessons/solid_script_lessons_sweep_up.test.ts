import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/**
 * Sweeps a flat 1 m by 0.2 m bar profile along a path and gives the size.
 *
 * @param values Extra Sweep Along Path values.
 * @param path Path points.
 * @returns Size text, or the error.
 */
function swept(values: Record<string, string>, path = '[0, 0, 0], [2, 0, 0]'): string {
  const profile = '[-0.5, 0, 0], [0.5, 0, 0], [0.5, 0.2, 0], [-0.5, 0.2, 0]';
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([
      { command: 'sweep_along_path', values: { path, profile, mesh: 'Yes', ...values } },
      { command: 'select_objects', values: { into: 'O' } },
      { command: 'echo', values: { value: '[O.Size]' } },
    ]),
  );
  return result.error?.message ?? result.messages[0] ?? '';
}

describe('Sweep Along Path Up', () => {
  it('keeps the profile up the world up way when Up is left off', () => {
    expect(swept({})).toBe('[2, 0.2, 1]');
  });

  it('turns the profile so its up side faces Up', () => {
    expect(swept({ up: '0, 0, 1' })).toBe('[2, 1, 0.2]');
  });

  it('takes an Up per path point', () => {
    expect(swept({ up: '[=Vector(0, 1 - [$Index], [$Index])]' }, '[0, 0, 0], [1, 0, 0], [2, 0, 0]')).toBe('[2, 1, 1]');
  });

  it('stops on an Up that is not two or three numbers, and reads x, y as x, y, 0', () => {
    expect(swept({ up: '1, 2, 3, 4' })).toContain('Up');
    expect(swept({ up: '0, 1' })).toBe(swept({ up: '0, 1, 0' }));
  });
});
