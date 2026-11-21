import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptEachUsed } from '@/solid_script/language/solid_script_each_uses.js';
import { solidScriptFormulaCheckInputs } from '@/solid_script/commands/solid_script_formula_inputs.js';

const line = (command: string, values: Record<string, string> = {}): SolidScriptLine => ({ command, values });

/**
 * Runs lines and returns what they printed, or the error.
 *
 * @param lines Script lines.
 * @returns Printed lines, or a one-item list of the error.
 */
function printed(...lines: SolidScriptLine[]): string[] {
  const result = solidScriptProgramRun(solidScriptDocumentCreate([...lines, line('cube')]), {});
  return result.error ? [result.error.message] : result.messages;
}

/**
 * Evaluates one formula outside any per-item field.
 *
 * @param formula Formula without [= ].
 * @returns Printed value, or the error.
 */
function formula(formula: string): string {
  return printed(line('echo', { value: `[=${formula}]` }))[0] ?? '';
}

/**
 * Keeps the numbers 0 to 99 that pass a Where.
 *
 * @param where Where formula.
 * @returns How many were kept.
 */
function kept(where: string): number {
  const list = Array.from({ length: 100 }, (_, index) => index).join(', ');
  return Number(
    printed(line('filter_list', { list, where, into: 'Kept' }), line('echo', { value: '[Kept.Count]' }))[0],
  );
}

/**
 * Lifts of the copies of Place At Points at some points along X.
 *
 * @param count How many points.
 * @param lift Lift formula.
 * @returns Lift of each copy.
 */
function lifts(count: number, lift: string): number[] {
  const at = Array.from({ length: count }, (_, index) => `[${index * 3}, 0, 0]`).join(', ');
  const out = printed(
    line('place_at_points', { at, lift, into: 'Placed' }),
    line('cube', { size: '1, 1, 1', anchor: 'Center, Center, Center' }),
    line('end'),
    line('echo', { value: '[Placed.Centers]' }),
  )[0];
  return (JSON.parse(out ?? '[]') as number[][]).map((center) => Math.round((center[1] ?? 0) * 1e6) / 1e6);
}

describe('SolidScript Random, Chance, Spread and Along', () => {
  it('takes an ID and a Seed in Random, the ID first', () => {
    expect(formula('Random(0, 1, 5)')).toBe(formula('Random(0, 1, 5, 0)'));
    expect(formula('Random(0, 1, 5, 1)')).not.toBe(formula('Random(0, 1, 5, 0)'));
    expect(formula('Random(0, 1, 5, 1)')).toBe(formula('Random(0, 1, 5, 1)'));
    expect(formula('Random(0, 1)')).toBe(formula('Random(0, 1, 0, 0)'));
  });

  it('uses [$Index] as the ID of Random in a per-item field', () => {
    const own = lifts(4, '[=Random(0, 1)]');
    expect(own).toEqual(lifts(4, '[=Random(0, 1, [$Index])]'));
    expect(new Set(own).size).toBe(4);
    expect(lifts(4, '[=Random(0, 1, [$Index], 7)]')).not.toEqual(own);
    expect(solidScriptEachUsed('[=Random(0, 1)]')).toBe(true);
    expect(solidScriptEachUsed('[=Random(0, 1, 3)]')).toBe(false);
  });

  it('says yes with a probability in Chance', () => {
    expect(kept('[=Chance(0)]')).toBe(0);
    expect(kept('[=Chance(1)]')).toBe(100);
    const some = kept('[=Chance(0.3)]');
    expect(some).toBeGreaterThan(15);
    expect(some).toBeLessThan(45);
    expect(kept('[=Chance(0.3, [$Index], 4)]')).not.toBe(kept('[=Chance(0.3, [$Index], 5)]'));
    expect(formula('Chance(0.5, 3)')).toMatch(/^(Yes|No)$/);
  });

  it('spreads values evenly over the items in Spread', () => {
    expect(lifts(3, '[=Spread(0, 1)]')).toEqual([0, 0.5, 1]);
    expect(formula('Spread(0, 10, 1, 3)')).toBe('5');
    expect(formula('Spread(Vector(0, 0, 0), Vector(2, 4, 0), 1, 3)')).toBe('[1, 2, 0]');
    expect(formula('Spread(4, 8, 0, 1)')).toBe('4');
    expect(formula('Spread(0, 1)')).toMatch(/Spread.*Index/);
  });

  it('walks a distance along a direction in Along', () => {
    expect(formula('Along(Vector(1, 0, 0), Vector(0, 2, 0), 3)')).toBe('[1, 3, 0]');
    expect(formula('Along(Vector(1, 0, 0), Vector(0, 0, 0), 3)')).toMatch(/direction/i);
  });

  it('shows ID and Seed as inputs, with [$Index] and 0 greyed in a per-item field', () => {
    const inputs = solidScriptFormulaCheckInputs('random', { each: 'Face' });
    expect(inputs.map((input) => input.name)).toEqual(['min', 'max', 'id', 'seed']);
    expect(inputs.find((input) => input.name === 'id')?.fallback).toBe('[$Index]');
    expect(inputs.find((input) => input.name === 'seed')?.default).toBe('0');
    expect(solidScriptFormulaCheckInputs('random', {}).find((input) => input.name === 'id')?.default).toBe('0');
    const spread = solidScriptFormulaCheckInputs('spread', { each: 'Point' });
    expect(spread.map((input) => input.fallback)).toEqual(['', '', '[$Index]', '[$Count]']);
  });
});
