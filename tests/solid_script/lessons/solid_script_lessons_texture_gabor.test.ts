import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { SOLID_SCRIPT_FUNCTIONS_GABOR } from '@/solid_script/language/solid_script_functions_gabor.js';

/**
 * Evaluates one formula and returns what Echo prints, or the error.
 *
 * @param formula Formula without [= ].
 * @returns Printed value.
 */
function formula(formula: string): string {
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([
      { command: 'echo', values: { value: `[=${formula}]` } },
      { command: 'cube', values: {} },
    ]),
    {},
  );
  return result.error ? result.error.message : (result.messages[0] ?? '');
}

/** A place to read the noise. */
const AT = 'Vector(0.31, 0.72, 0.13)';

describe('Gabor', () => {
  it('gives Value and Phase from 0 to 1 and an Intensity of at least 0, the same each time', () => {
    for (const at of [AT, 'Vector(1.7, -2.2, 0.4)', 'Vector(-3, 5, 8)']) {
      expect(formula(`Gabor(${at}) >= 0 && Gabor(${at}) <= 1`)).toBe('Yes');
      expect(formula(`Gabor(${at}, 5, 2, 1, Vector(1, 1, 0), "Phase") >= 0`)).toBe('Yes');
      expect(formula(`Gabor(${at}, 5, 2, 1, Vector(1, 1, 0), "Intensity") >= 0`)).toBe('Yes');
    }
    expect(formula(`Gabor(${AT})`)).toBe(formula(`Gabor(${AT})`));
  });

  it('multiplies the position by Scale, 5 when left off', () => {
    expect(formula(`Gabor(${AT})`)).toBe(formula(`Gabor(${AT} * 5, 1)`));
    expect(formula(`Gabor(${AT}, 2) == Gabor(${AT})`)).toBe('No');
  });

  it('keeps Value, Phase and Intensity as one wave: Value less a half is half the Intensity times the sine of the Phase', () => {
    const value = `Gabor(${AT}, 3)`;
    const phase = `Gabor(${AT}, 3, 2, 1, Vector(1, 1, 0), "Phase")`;
    const intensity = `Gabor(${AT}, 3, 2, 1, Vector(1, 1, 0), "Intensity")`;
    expect(formula(`Abs((${value} - 0.5) * 2 - ${intensity} * Sin((${phase} * 2 - 1) * 180)) < 0.000001`)).toBe('Yes');
  });

  it('flattens to a half when Frequency is 0, as no wave runs through the bumps', () => {
    expect(formula(`Abs(Gabor(${AT}, 5, 0) - 0.5) < 0.01`)).toBe('Yes');
  });

  it('runs its stripes along Orientation when Anisotropy is 1', () => {
    expect(formula(`Gabor(${AT}, 5, 2, 1, Vector(1, 0, 0)) == Gabor(${AT}, 5, 2, 1, Vector(0, 1, 0))`)).toBe('No');
    expect(formula(`Gabor(${AT}, 5, 2, 1, Vector(2, 0, 0)) == Gabor(${AT}, 5, 2, 1, Vector(1, 0, 0))`)).toBe('Yes');
  });

  it('keeps nearly every Value between 0 and 1, spread well around a half', () => {
    const values = Array.from({ length: 2000 }, (_, i) =>
      SOLID_SCRIPT_FUNCTIONS_GABOR.gabor([
        [Math.sin(i * 12.9) * 40, Math.sin(i * 78.2) * 30, Math.sin(i * 39.4) * 20],
        1,
      ]),
    );
    const spread = Math.sqrt(values.reduce((sum, value) => sum + (value - 0.5) ** 2, 0) / values.length);
    expect(values.filter((value) => value < 0 || value > 1).length / values.length).toBeLessThan(0.03);
    expect(spread).toBeGreaterThan(0.12);
    expect(spread).toBeLessThan(0.2);
  });

  it('stops on a position that is not a vector and an Output it does not know', () => {
    expect(formula('Gabor(2)')).toContain('Gabor');
    expect(formula(`Gabor(${AT}, 5, 2, 1, Vector(1, 1, 0), "Loud")`)).toContain('Gabor Output');
  });
});
