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

const placed = 'Transform(Vector(1, 2, 3), Vector(0, 90, 0), Vector(2, 2, 2))';

describe('matrices', () => {
  it('builds a matrix from Move, Rotate and Scale and reads them back', () => {
    expect(formula(`MatrixMove(${placed})`)).toBe('[1, 2, 3]');
    expect(formula(`Equal(MatrixRotate(${placed}), Vector(0, 90, 0))`)).toBe('Yes');
    expect(formula(`Equal(MatrixScale(${placed}), Vector(2, 2, 2))`)).toBe('Yes');
    expect(formula('Transform(Vector(1, 2, 3), Vector(0, 0, 0), Vector(1, 1, 1))')).toBe(
      '[[1, 0, 0, 1], [0, 1, 0, 2], [0, 0, 1, 3], [0, 0, 0, 1]]',
    );
  });

  it('moves points with TransformPoint but only turns and scales directions', () => {
    expect(formula(`Equal(TransformPoint(${placed}, Vector(1, 0, 0)), Vector(1, 2, 1))`)).toBe('Yes');
    expect(formula(`Equal(TransformDirection(${placed}, Vector(1, 0, 0)), Vector(0, 0, -2))`)).toBe('Yes');
  });

  it('undoes a matrix with Invert, and stops on one that cannot be undone', () => {
    expect(formula(`Equal(TransformPoint(Invert(${placed}), Vector(1, 2, 1)), Vector(1, 0, 0))`)).toBe('Yes');
    expect(formula('Invert(Transform(Vector(0, 0, 0), Vector(0, 0, 0), Vector(0, 1, 1)))')).toContain('try');
  });
});
