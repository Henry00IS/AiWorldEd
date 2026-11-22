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

describe('BitNot, BitShift and BitRotate', () => {
  it('flips every bit of a 32-bit whole number', () => {
    expect(formula('BitNot(0)')).toBe('-1');
    expect(formula('BitNot(5)')).toBe('-6');
  });

  it('shifts left for a positive Shift and right, keeping the sign, for a negative one', () => {
    expect(formula('BitShift(3, 2)')).toBe('12');
    expect(formula('BitShift(12, -2)')).toBe('3');
    expect(formula('BitShift(-8, -1)')).toBe('-4');
  });

  it('rotates bits that fall off one end back in at the other', () => {
    expect(formula('BitRotate(1, -1)')).toBe('-2147483648');
    expect(formula('BitRotate(-2147483648, 1)')).toBe('1');
    expect(formula('BitRotate(6, 33)')).toBe('12');
  });

  it('stops on a Shift that is not a number', () => {
    expect(formula('BitShift(1, "far")')).toContain('BitShift');
  });
});
