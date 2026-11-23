import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/**
 * Evaluates one formula and returns what Echo prints, or the error.
 *
 * @param formula Formula without [= ].
 * @returns Printed value.
 */
function formula(formula: string): string {
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([{ command: 'echo', values: { value: `[=${formula}]` } }]),
    {},
  );
  return result.error ? result.error.message : (result.messages[0] ?? '');
}

describe('Gradient', () => {
  it('runs from 0 to 1 along X by default, held between 0 and 1', () => {
    expect(formula('Gradient(Vector(0.25, 0, 0))')).toBe('0.25');
    expect(formula('Gradient(Vector(-1, 0, 0))')).toBe('0');
    expect(formula('Gradient(Vector(3, 0, 0))')).toBe('1');
  });

  it('squares, eases and goes diagonally', () => {
    expect(formula('Gradient(Vector(0.5, 0, 0), "Quadratic")')).toBe('0.25');
    expect(formula('Gradient(Vector(0.25, 0, 0), "Easing")')).toBe('0.15625');
    expect(formula('Gradient(Vector(0.5, 0.3, 0), "Diagonal")')).toBe('0.4');
  });

  it('fades out from the middle as a ball and turns around Z', () => {
    expect(formula('Abs(Gradient(Vector(0, 0.5, 0), "Spherical") - 0.5) < 0.0001')).toBe('Yes');
    expect(formula('Abs(Gradient(Vector(0, 0.5, 0), "Quadratic Sphere") - 0.25) < 0.0001')).toBe('Yes');
    expect(formula('Gradient(Vector(2, 0, 0), "Spherical")')).toBe('0');
    expect(formula('Gradient(Vector(0, 0, 0), "Spherical")')).toBe('1');
    expect(formula('Gradient(Vector(0, 0, 0), "Quadratic Sphere")')).toBe('1');
    expect(formula('Gradient(Vector(1, 0, 0), "Radial")')).toBe('0.5');
    expect(formula('Gradient(Vector(0, 1, 0), "Radial")')).toBe('0.75');
  });

  it('names the kinds it knows when given another', () => {
    expect(formula('Gradient(Vector(0, 0, 0), "Wobbly")')).toContain('Radial');
  });
});
