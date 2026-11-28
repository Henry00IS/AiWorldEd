import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import {
  solidScriptNumberRead,
  solidScriptNumberSafe,
  solidScriptValueSafe,
} from '@/solid_script/language/solid_script_number_safe.js';
import { solidScriptValueNumber } from '@/solid_script/language/solid_script_value.js';

const line = (command: string, values: Record<string, string> = {}): SolidScriptLine => ({ command, values });
const END = line('end');
const echo = (value: string): SolidScriptLine => line('echo', { value });
const MAX = String(Number.MAX_VALUE);
const MIN = String(-Number.MAX_VALUE);

/**
 * Runs script lines that must succeed.
 *
 * @param lines Lines.
 * @param persistent Stored persistent record.
 * @returns Messages.
 */
function printed(lines: SolidScriptLine[], persistent?: Readonly<Record<string, unknown>>): string[] {
  const result = solidScriptProgramRun(solidScriptDocumentCreate(lines), persistent ? { persistent } : {});
  expect(result.error?.message ?? null).toBeNull();
  return result.messages;
}

/**
 * What one formula gives, as Echo writes it.
 *
 * @param formula Formula without its [= ].
 * @returns Text.
 */
function formula(formula: string): string {
  return printed([echo(`[=${formula}]`)])[0] ?? '';
}

describe('SolidScript numbers are never NaN or Infinity', () => {
  it('turns NaN into 0 and Infinity into the largest number', () => {
    expect(solidScriptNumberSafe(NaN)).toBe(0);
    expect(solidScriptNumberSafe(Infinity)).toBe(Number.MAX_VALUE);
    expect(solidScriptNumberSafe(-Infinity)).toBe(-Number.MAX_VALUE);
    expect(solidScriptNumberSafe(-2.5)).toBe(-2.5);
    expect(solidScriptNumberSafe(-0)).toBe(-0);
  });

  it('fixes the numbers inside lists, and gives back a list with nothing to fix as it is', () => {
    const fine = [1, [2, 'a'], 'b'];
    expect(solidScriptValueSafe(fine)).toBe(fine);
    expect(solidScriptValueSafe([NaN, [Infinity, 'a'], -Infinity])).toEqual([
      0,
      [Number.MAX_VALUE, 'a'],
      -Number.MAX_VALUE,
    ]);
    expect(solidScriptValueSafe('NaN')).toBe('NaN');
    expect(solidScriptValueSafe(true)).toBe(true);
  });

  it('reads number text too large to hold as the largest number, and keeps NaN and Infinity text as text', () => {
    expect(solidScriptNumberRead('1e400')).toBe(Number.MAX_VALUE);
    expect(solidScriptNumberRead('-1e400')).toBe(-Number.MAX_VALUE);
    expect(solidScriptNumberRead('Infinity')).toBeUndefined();
    expect(solidScriptNumberRead('-Infinity')).toBeUndefined();
    expect(solidScriptNumberRead('NaN')).toBeUndefined();
    expect(solidScriptNumberRead('')).toBeUndefined();
    expect(solidScriptNumberRead('2.5')).toBe(2.5);
    expect(solidScriptValueNumber(' 1e999 ')).toBe(Number.MAX_VALUE);
  });

  it('gives 0 where a math function has no answer', () => {
    for (const text of ['Sqrt(-1)', 'Ln(-1)', 'Asin(2)', 'Acos(-3)', 'Pow(-8, 1 / 3)', 'Exp(1000) - Exp(1000)'])
      expect(formula(text), text).toBe('0');
    expect(formula('Round(Sqrt(-1)) + 1')).toBe('1');
  });

  it('gives the largest number, or its negative, where a result is too large', () => {
    for (const text of ['Pow(10, 400)', 'Exp(1000)', '1e400', '1e308 * 10', 'Min()'])
      expect(formula(text), text).toBe(MAX);
    for (const text of ['Ln(0)', 'Log(0)', '-Exp(1000)', '-1e400', 'Max()']) expect(formula(text), text).toBe(MIN);
  });

  it('fixes the items of vectors and lists a formula makes', () => {
    expect(formula('Vector(Sqrt(-1), 1, Exp(1000))')).toBe(`[0, 1, ${MAX}]`);
    expect(formula('[Sqrt(-1), 2, 3, 4]')).toBe('[0, 2, 3, 4]');
  });

  it('keeps division by zero an error', () => {
    const result = solidScriptProgramRun(solidScriptDocumentCreate([echo('[=1 / 0]')]), {});
    expect(result.error?.message).toMatch(/division by zero/);
  });

  it('fixes what a Function returns, a variable holds and a condition reads', () => {
    expect(
      printed([line('function', { name: 'F' }), line('return', { value: '[=Sqrt(-1)]' }), END, echo('[=F()]')]),
    ).toEqual(['0']);
    const chain = [line('variable', { name: 'A', value: '[=Exp(800)]' }), echo('[=[A] * [A]] [=[A] - [A]]')];
    expect(printed(chain)).toEqual([`${MAX} 0`]);
    expect(printed([line('if', { condition: 'Sqrt(-1) == 0' }), echo('zero'), END])).toEqual(['zero']);
  });

  it('reads typed number text too large to hold, in a field and an Input', () => {
    expect(printed([line('variable', { name: 'X', value: '1e400' }), echo('[X]')])).toEqual([MAX]);
    expect(printed([line('input', { name: 'W', default: '1e400' }), echo('[W]')])).toEqual([MAX]);
    expect(printed([echo('[=Parse("1e400")]')])).toEqual([MAX]);
  });

  it('fixes persistent values stored from outside the script', () => {
    const stored = { Big: Infinity, Bad: NaN, Items: [1, -Infinity] };
    expect(printed([echo('[$Persistent.Big] [$Persistent.Bad] [$Persistent.Items]')], stored)).toEqual([
      `${MAX} 0 [1, ${MIN}]`,
    ]);
  });
});
