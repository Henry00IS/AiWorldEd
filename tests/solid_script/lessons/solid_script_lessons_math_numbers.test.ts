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

describe('number helpers', () => {
  it('takes Log to base 10, or to a given base, and refuses a bad base', () => {
    expect(formula('Log(100)')).toBe('2');
    expect(formula('Log(16, 4)')).toBe('2');
    expect(formula('Log(8, 2)')).toBe('3');
    expect(formula('Log(Vector(10, 100, 1), 10)')).toBe('[1, 2, 0]');
    expect(formula('Log(5, 1)')).toContain('base above 0');
  });

  it('gives hyperbolic Sinh, Cosh and Tanh per axis', () => {
    expect(formula('Sinh(0)')).toBe('0');
    expect(formula('Cosh(Vector(0, 0, 0))')).toBe('[1, 1, 1]');
    expect(formula('Round(Tanh(100))')).toBe('1');
  });

  it('finds Gcd and Lcm of whole numbers, Lcm 0 when either is 0', () => {
    expect(formula('Gcd(12, 18)')).toBe('6');
    expect(formula('Gcd(0, 5)')).toBe('5');
    expect(formula('Lcm(4, 6)')).toBe('12');
    expect(formula('Lcm(0, 6)')).toBe('0');
  });

  it('gives Xor and the bit operations', () => {
    expect(formula('Xor(true, false)')).toBe('Yes');
    expect(formula('Xor(true, true)')).toBe('No');
    expect(formula('BitAnd(12, 10)')).toBe('8');
    expect(formula('BitOr(12, 10)')).toBe('14');
    expect(formula('BitXor(12, 10)')).toBe('6');
  });

  it('gives Median, Range and StdDev of a list, refusing an empty one', () => {
    expect(formula('Median([3, 1, 2])')).toBe('2');
    expect(formula('Median([4, 1, 3, 2])')).toBe('2.5');
    expect(formula('Range([3, 9, 5])')).toBe('6');
    expect(formula('StdDev([2, 4, 4, 4, 5, 5, 7, 9])')).toBe('2');
    expect(formula('Median([])')).toContain('at least one number');
  });
});
