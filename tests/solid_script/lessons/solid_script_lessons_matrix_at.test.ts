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

const placed = 'Transform(Vector(1, 2, 3), Vector(0, 0, 0), Vector(4, 5, 6))';

describe('MatrixAt', () => {
  it('reads one number of a matrix by row and column, from 0', () => {
    expect(formula(`MatrixAt(${placed}, 0, 3)`)).toBe('1');
    expect(formula(`MatrixAt(${placed}, 2, 3)`)).toBe('3');
    expect(formula(`MatrixAt(${placed}, 1, 1)`)).toBe('5');
    expect(formula(`MatrixAt(${placed}, 3, 3)`)).toBe('1');
    expect(formula(`MatrixAt(${placed}, 3, 0)`)).toBe('0');
  });

  it('says which rows and columns there are when one is outside the matrix', () => {
    expect(formula(`MatrixAt(${placed}, 4, 0)`)).toContain('0 to 3');
    expect(formula(`MatrixAt(${placed}, 0, 1.5)`)).toContain('0 to 3');
  });
});
