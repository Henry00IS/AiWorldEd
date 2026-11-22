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

describe('StdDev and Variance', () => {
  it('spread a whole list over all its items', () => {
    expect(formula('StdDev([2, 4, 4, 4, 5, 5, 7, 9])')).toBe('2');
    expect(formula('Variance([2, 4, 4, 4, 5, 5, 7, 9])')).toBe('4');
  });

  it('give each item the spread of its own group', () => {
    expect(formula('StdDev([1, 3, 10, 10], [0, 0, 1, 1])')).toBe('[1, 1, 0, 0]');
    expect(formula('Variance([1, 3, 2, 8], [5, 5, 7, 7])')).toBe('[1, 1, 9, 9]');
  });

  it('spread vectors axis by axis', () => {
    expect(formula('Variance([Vector(1, 0, 2), Vector(3, 0, 2)])')).toBe('[1, 0, 0]');
    expect(formula('StdDev([Vector(0, 0, 0), Vector(2, 4, 0), Vector(5, 5, 5)], [0, 0, 1])')).toBe(
      '[[1, 2, 0], [1, 2, 0], [0, 0, 0]]',
    );
  });

  it('needs one group per item', () => {
    expect(formula('Variance([1, 2, 3], [0, 1])')).toContain('one group per item');
  });
});
