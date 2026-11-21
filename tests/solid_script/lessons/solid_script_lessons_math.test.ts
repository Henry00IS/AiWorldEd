import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptFormulaCheckInputs } from '@/solid_script/commands/solid_script_formula_inputs.js';

const line = (command: string, values: Record<string, string> = {}): SolidScriptLine => ({ command, values });

/**
 * Evaluates one formula and returns what Echo prints, or the error.
 *
 * @param formula Formula without [= ].
 * @returns Printed value.
 */
function formula(formula: string): string {
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([line('echo', { value: `[=${formula}]` }), line('cube')]),
    {},
  );
  return result.error ? result.error.message : (result.messages[0] ?? '');
}

describe('forgiving numbers', () => {
  it('treats numbers within 0.001 as equal for == and !=, also inside vectors', () => {
    expect(formula('0.1 + 0.2 == 0.3')).toBe('Yes');
    expect(formula('10 / 3 * 3 == 10')).toBe('Yes');
    expect(formula('1 == 1.0005')).toBe('Yes');
    expect(formula('1 == 1.002')).toBe('No');
    expect(formula('1 != 1.0005')).toBe('No');
    expect(formula('List(1, 2.0004) == List(1, 2)')).toBe('Yes');
    expect(formula('"a" == "a"')).toBe('Yes');
  });

  it('gives Equal with its own tolerance, 0.001 when left off', () => {
    expect(formula('Equal(1, 1.0005)')).toBe('Yes');
    expect(formula('Equal(1, 1.2, 0.5)')).toBe('Yes');
    expect(formula('Equal(1, 1.2, 0.1)')).toBe('No');
    expect(formula('Equal(List(0, 1, 0), List(0, 0.99, 0), 0.05)')).toBe('Yes');
  });
});

describe('RandomInt', () => {
  it('gives whole numbers from Min to Max, Max included, and swaps a reversed range', () => {
    const seen = new Set<string>();
    for (let id = 0; id < 200; id++) seen.add(formula(`RandomInt(1, 3, ${id})`));
    expect([...seen].sort()).toEqual(['1', '2', '3']);
    const reversed = new Set<string>();
    for (let id = 0; id < 200; id++) reversed.add(formula(`RandomInt(3, 1, ${id})`));
    expect([...reversed].sort()).toEqual(['1', '2', '3']);
    expect(formula('RandomInt(5, 5)')).toBe('5');
  });

  it('is the same for the same ID and Seed, and differs with another Seed', () => {
    expect(formula('RandomInt(0, 1000, 7, 2)')).toBe(formula('RandomInt(0, 1000, 7, 2)'));
    const a = Array.from({ length: 20 }, (_, id) => formula(`RandomInt(0, 1000, ${id}, 1)`));
    const b = Array.from({ length: 20 }, (_, id) => formula(`RandomInt(0, 1000, ${id}, 2)`));
    expect(a).not.toEqual(b);
  });

  it('fills in its ID per item in a Where', () => {
    const inputs = solidScriptFormulaCheckInputs('random_int', { each: 'Face' });
    expect(inputs.map((input) => input.name)).toEqual(['min', 'max', 'id', 'seed']);
    expect(inputs.find((input) => input.name === 'id')?.fallback).toBe('[$Index]');
  });
});

describe('math on vectors, per axis', () => {
  it('works one-number functions on each axis', () => {
    expect(formula('Abs(List(-1, 2, -3))')).toBe('[1, 2, 3]');
    expect(formula('Floor(List(1.5, -1.5, 2))')).toBe('[1, -2, 2]');
    expect(formula('Ceil(List(1.2, -1.2, 0))')).toBe('[2, -1, 0]');
    expect(formula('Round(List(1.4, 1.6, -0.4))')).toBe('[1, 2, 0]');
    expect(formula('Sign(List(-4, 0, 7))')).toBe('[-1, 0, 1]');
    expect(formula('Fract(List(1.25, 2.5, 3))')).toBe('[0.25, 0.5, 0]');
    expect(formula('Snap(List(0.3, 0.6, 1.1), 0.5)')).toBe('[0.5, 0.5, 1]');
    expect(formula('Mod(List(5, -1, 3), 3)')).toBe('[2, 2, 0]');
    expect(formula('Pow(List(2, 3, 1), 2)')).toBe('[4, 9, 1]');
    expect(formula('Sqrt(List(4, 9, 16))')).toBe('[2, 3, 4]');
    expect(formula('Round(Sin(List(0, 90, 30)) * 100)')).toBe('[0, 100, 50]');
  });

  it('gives Min and Max of vectors per axis, and still the lowest of one list', () => {
    expect(formula('Min(List(1, 5, 3), List(4, 2, 6))')).toBe('[1, 2, 3]');
    expect(formula('Max(List(1, 5, 3), List(4, 2, 6))')).toBe('[4, 5, 6]');
    expect(formula('Min(List(4, 2, 6))')).toBe('2');
    expect(formula('Max(1, 7, 3)')).toBe('7');
  });

  it('stops on vectors of different sizes with a hint', () => {
    expect(formula('Min(List(1, 2), List(1, 2, 3))')).toMatch(/same size/);
  });
});
