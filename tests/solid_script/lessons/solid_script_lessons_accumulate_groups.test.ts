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

describe('Accumulate with Groups and Output', () => {
  it('sums each group on its own, in list order', () => {
    expect(formula('Accumulate(List(1, 2, 3, 4), List("A", "B", "A", "B"))')).toBe('[1, 2, 4, 6]');
  });

  it('gives the sum before each item with Trailing, and the group total with Total', () => {
    expect(formula('Accumulate(List(1, 2, 3, 4), List(0, 0, 1, 1), "Trailing")')).toBe('[0, 1, 0, 3]');
    expect(formula('Accumulate(List(1, 2, 3, 4), List(0, 0, 1, 1), "Total")')).toBe('[3, 3, 7, 7]');
    expect(formula('Accumulate(List(1, 2, 3), List(), "Total")')).toBe('[6, 6, 6]');
  });

  it('adds vectors axis by axis', () => {
    expect(formula('Accumulate(List(Vector(1, 0, 0), Vector(0, 2, 0)))')).toBe('[[1, 0, 0], [1, 2, 0]]');
  });

  it('says what it needs when Groups or Output do not fit', () => {
    expect(formula('Accumulate(List(1, 2), List(0))')).toContain('one group per item');
    expect(formula('Accumulate(List(1, 2), List(), "Middle")')).toContain('Leading, Trailing or Total');
  });
});
