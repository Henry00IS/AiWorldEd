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

describe('Chunks', () => {
  it('splits a flat list into lists of the given sizes, in list order', () => {
    expect(formula('Chunks(List(1, 2, 3, 4, 5), List(2, 3))')).toBe('[[1, 2], [3, 4, 5]]');
    expect(formula('Chunks(List(1, 2, 3, 4), List(0, 4))')).toBe('[[], [1, 2, 3, 4]]');
  });

  it('cuts into lists of one size when Sizes is a number, the last taking what is left', () => {
    expect(formula('Chunks(List(1, 2, 3, 4, 5), 2)')).toBe('[[1, 2], [3, 4], [5]]');
    expect(formula('Chunks(List(Vector(1, 0, 0), Vector(0, 1, 0)), 1)')).toBe('[[[1, 0, 0]], [[0, 1, 0]]]');
  });

  it('needs sizes that use every item exactly', () => {
    expect(formula('Chunks(List(1, 2, 3), List(1, 1))')).toContain('add up to 3');
    expect(formula('Chunks(List(1, 2, 3), 0)')).toContain('whole Sizes of 1 or more');
    expect(formula('Chunks(List(1, 2, 3), List(-1, 4))')).toContain('whole Sizes of 0 or more');
  });

  it('builds one path per chunk of a flat point list', () => {
    const points = 'List(Vector(0, 0, 0), Vector(1, 0, 0), Vector(1, 1, 0), Vector(5, 0, 0), Vector(6, 0, 0))';
    const result = solidScriptProgramRun(
      solidScriptDocumentCreate([
        { command: 'for_each', values: { variable: 'Piece', list: `[=Chunks(${points}, List(3, 2))]` } },
        { command: 'path_from_points', values: { points: '[Piece]', into: 'P' } },
        { command: 'echo', values: { value: '[P.Length]' } },
        { command: 'end' },
        { command: 'cube', values: {} },
      ]),
      {},
    );
    expect(result.error?.message).toBeUndefined();
    expect(result.messages).toEqual(['2', '1']);
  });
});
