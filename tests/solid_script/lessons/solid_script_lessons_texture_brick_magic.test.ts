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
    solidScriptDocumentCreate([
      { command: 'echo', values: { value: `[=${formula}]` } },
      { command: 'cube', values: {} },
    ]),
    {},
  );
  return result.error ? result.error.message : (result.messages[0] ?? '');
}

describe('Brick', () => {
  it('gives 0 inside a brick and 1 on the mortar between bricks', () => {
    expect(formula('Brick(Vector(0, 0.125, 0))')).toBe('0');
    expect(formula('Brick(Vector(0, 0.25, 0))')).toBe('1');
    expect(formula('Brick(Vector(0.25, 0.375, 0))')).toBe('0');
  });

  it('shifts every other row, from the first, by Offset of a brick width', () => {
    expect(formula('Brick(Vector(0.25, 0.125, 0))')).toBe('1');
    expect(formula('Brick(Vector(0, 0.375, 0))')).toBe('1');
    expect(formula('Brick(Vector(0.25, 0.125, 0), 1, 0, "Mortar", 0.02, 0.5, 0.25, 0)')).toBe('0');
  });

  it('softens the mortar edge with Smooth and widens it with Mortar', () => {
    expect(formula('Brick(Vector(0, 0.125, 0), 1, 0, "Mortar", 0.2)')).toBe('1');
    expect(formula('Brick(Vector(0.2, 0.125, 0), 1, 0, "Mortar", 0.1, 0.5, 0.25, 0.5, 1)')).toBe('0.5');
  });

  it('gives one Tint from 0 to 1 per brick, the same across the brick', () => {
    const tint = formula('Brick(Vector(0.1, 0.1, 0), 1, 3, "Tint")');
    expect(formula('Brick(Vector(0.2, 0.2, 0), 1, 3, "Tint")')).toBe(tint);
    expect(Number(tint)).toBeGreaterThanOrEqual(0);
    expect(Number(tint)).toBeLessThan(1);
  });

  it('stops on an unknown output', () => {
    expect(formula('Brick(Vector(0, 0, 0), 1, 0, "Colour")')).toContain('Mortar or Tint');
  });
});

describe('Magic', () => {
  it('gives a colour vector of three values around 0.5', () => {
    const colour = formula('Magic(Vector(0.3, 0.2, 0.1))');
    const values = colour.replace(/[[\]]/g, '').split(',').map(Number);
    expect(values).toHaveLength(3);
    for (const value of values) expect(Math.abs(value - 0.5)).toBeLessThanOrEqual(0.5 + 1e-9);
  });

  it('changes with Depth and Distortion', () => {
    const base = formula('Magic(Vector(0.3, 0.2, 0.1), 1, 2, 1)');
    expect(formula('Magic(Vector(0.3, 0.2, 0.1), 1, 5, 1)')).not.toBe(base);
    expect(formula('Magic(Vector(0.3, 0.2, 0.1), 1, 2, 3)')).not.toBe(base);
  });

  it('stops on a Depth outside 0 to 10', () => {
    expect(formula('Magic(Vector(0, 0, 0), 1, 11)')).toContain('Depth from 0 to 10');
  });
});
