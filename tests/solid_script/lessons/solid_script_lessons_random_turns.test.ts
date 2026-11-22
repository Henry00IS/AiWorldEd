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

/**
 * Reads a printed vector.
 *
 * @param printed Text such as [1, 2, 3].
 * @returns Numbers.
 */
function numbers(printed: string): number[] {
  return printed.replace(/[[\]]/g, '').split(',').map(Number);
}

describe('random directions and rotations, and First/Last with a count', () => {
  it('gives a unit RandomDirection that repeats for an ID and Seed and changes with them', () => {
    const one = numbers(formula('RandomDirection(3, 1)'));
    expect(Math.hypot(...one)).toBeCloseTo(1, 6);
    expect(formula('RandomDirection(3, 1)')).toBe(formula('RandomDirection(3, 1)'));
    expect(formula('RandomDirection(4, 1)')).not.toBe(formula('RandomDirection(3, 1)'));
    expect(formula('RandomDirection(3, 2)')).not.toBe(formula('RandomDirection(3, 1)'));
  });

  it('spreads RandomDirection over every side', () => {
    const heights = Array.from({ length: 200 }, (_, id) => numbers(formula(`RandomDirection(${id})`))[1] ?? 0);
    expect(heights.filter((height) => height > 0).length).toBeGreaterThan(70);
    expect(heights.filter((height) => height < 0).length).toBeGreaterThan(70);
  });

  it('gives a RandomRotation of three angles that repeats for an ID and differs between IDs', () => {
    const turn = numbers(formula('RandomRotation(7)'));
    expect(turn).toHaveLength(3);
    for (const degrees of turn) expect(Math.abs(degrees)).toBeLessThanOrEqual(180);
    expect(formula('RandomRotation(7)')).toBe(formula('RandomRotation(7)'));
    expect(formula('RandomRotation(8)')).not.toBe(formula('RandomRotation(7)'));
  });

  it('takes a Count of items with First and Last, all of them when the list is short', () => {
    expect(formula('First([4, 5, 6])')).toBe('4');
    expect(formula('First([4, 5, 6], 2)')).toBe('[4, 5]');
    expect(formula('Last([4, 5, 6], 2)')).toBe('[5, 6]');
    expect(formula('Last([4, 5, 6], 9)')).toBe('[4, 5, 6]');
    expect(formula('Last([4, 5, 6], 0)')).toBe('[]');
    expect(formula('First([4, 5, 6], -1)')).toContain('0 or more');
  });
});
