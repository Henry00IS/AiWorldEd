import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/**
 * Makes a closed 4 by 4 square path and prints how many points it has.
 *
 * @param values Extra Path fields.
 * @returns Program result.
 */
function square(values: Record<string, string>): ReturnType<typeof solidScriptProgramRun> {
  return solidScriptProgramRun(
    solidScriptDocumentCreate([
      {
        command: 'path',
        values: {
          shape: 'From Points',
          points: '[0, 0, 0], [4, 0, 0], [4, 4, 0], [0, 4, 0]',
          closed: 'Yes',
          sides: '4',
          into: 'P',
          ...values,
        },
      },
      { command: 'echo', values: { value: '[P.Points.Count]' } },
    ]),
  );
}

describe('Path From Points per-corner Radius and Limit Radius', () => {
  it('rounds only the corners whose Radius is above 0', () => {
    const result = square({ corner_radius: '[=Max(0, [$Index] - 1) * 0.5]' });
    expect(result.error?.message).toBeUndefined();
    expect(result.messages).toEqual(['12']);
  });

  it('stops when two corners do not fit on one stretch', () => {
    expect(square({ corner_radius: '3' }).error?.message).toContain('Limit Radius');
  });

  it('shrinks radii that do not fit when Limit Radius is Yes', () => {
    const result = square({ corner_radius: '3', limit_radius: 'Yes' });
    expect(result.error?.message).toBeUndefined();
    expect(result.messages).toEqual(['16']);
  });
});
