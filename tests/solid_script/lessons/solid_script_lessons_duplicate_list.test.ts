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

describe('Duplicate', () => {
  it('repeats every item of a list Counts times, in list order', () => {
    expect(formula('Duplicate(List(4, 5, 6), 2)')).toBe('[4, 4, 5, 5, 6, 6]');
    expect(formula('Duplicate(List(Vector(1, 0, 0), Vector(0, 2, 0)), List(1, 3))')).toBe(
      '[[1, 0, 0], [0, 2, 0], [0, 2, 0], [0, 2, 0]]',
    );
    expect(formula('Duplicate(List(4, 5, 6), List(0, 1, 0))')).toBe('[5]');
  });

  it('gives the copy number or the source position of every result with Output', () => {
    expect(formula('Duplicate(List(4, 5), List(2, 3), "Copy")')).toBe('[0, 1, 0, 1, 2]');
    expect(formula('Duplicate(List(4, 5), List(2, 3), "Source")')).toBe('[0, 0, 1, 1, 1]');
  });

  it('needs whole Counts of 0 or more, one per item', () => {
    expect(formula('Duplicate(List(4, 5), -1)')).toContain('whole Counts of 0 or more');
    expect(formula('Duplicate(List(4, 5), List(1))')).toContain('one Count per item');
    expect(formula('Duplicate(List(4, 5), 1, "Other")')).toContain('Output Items, Copy or Source');
    expect(formula('Duplicate(List(4, 5), 1000000000)')).toContain('more than 100,000 items');
  });
});
