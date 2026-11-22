import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/**
 * Sweeps a square profile along a straight path with a Twist and gives the size
 * of the result.
 *
 * @param twist Twist field.
 * @param mesh As Mesh field.
 * @returns Size text, or the error.
 */
function sweptSize(twist: string, mesh = 'Yes'): string {
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([
      { command: 'sweep_along_path', values: { path: '[0, 0, 0], [2, 0, 0]', radius: '1', sides: '4', twist, mesh } },
      { command: 'select_objects', values: { into: 'O' } },
      { command: 'echo', values: { value: '[O.Size]' } },
    ]),
  );
  return result.error?.message ?? result.messages[0] ?? '';
}

describe('Sweep Along Path Twist', () => {
  it('turns the profile about the path, a square back onto itself after 90 degrees', () => {
    const plain = sweptSize('0');
    expect(sweptSize('45')).not.toBe(plain);
    expect(sweptSize('90')).toBe(plain);
  });

  it('twists per point, so the ends differ', () => {
    expect(sweptSize('[=[$Index] * 45]')).not.toBe(sweptSize('0'));
    expect(sweptSize('[=[$Index] * 45]', 'No')).not.toMatch(/line/);
  });
});

describe('Sweep Along Path Fill Caps', () => {
  it('closes the ends of an open path by default and leaves them open with Fill Caps off', () => {
    const faces = (caps: string): string => {
      const result = solidScriptProgramRun(
        solidScriptDocumentCreate([
          { command: 'sweep_along_path', values: { path: '[0, 0, 0], [2, 0, 0]', sides: '6', mesh: 'Yes', caps } },
          { command: 'select_objects', values: { into: 'O' } },
          { command: 'echo', values: { value: '[O(0).Faces.Count]' } },
        ]),
      );
      return result.error?.message ?? result.messages[0] ?? '';
    };
    expect(faces('Yes')).toBe('8');
    expect(faces('No')).toBe('6');
  });
});
