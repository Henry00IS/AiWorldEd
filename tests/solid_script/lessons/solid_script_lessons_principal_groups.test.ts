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

const points = 'List(Vector(0, 0, 0), Vector(2, 0, 0), Vector(0, 5, 0), Vector(0, 9, 0))';

describe('PrincipalAxes per group', () => {
  it('gives every point the result of its own group', () => {
    expect(formula(`PrincipalAxes(${points}, "Center", List(0, 0, 1, 1))`)).toBe(
      '[[1, 0, 0], [1, 0, 0], [0, 7, 0], [0, 7, 0]]',
    );
    expect(formula(`First(First(PrincipalAxes(${points}, "Axes", List(0, 0, 1, 1))))`)).toBe('[1, 0, 0]');
    expect(formula(`First(Last(PrincipalAxes(${points}, "Axes", List(0, 0, 1, 1))))`)).toBe('[0, 1, 0]');
    expect(formula(`First(Last(PrincipalAxes(${points}, "Spread", List(0, 0, 1, 1))))`)).toBe('2');
  });

  it('works on all points together when Groups is empty', () => {
    expect(formula(`PrincipalAxes(${points}, "Center", List())`)).toBe('[0.5, 3.5, 0]');
  });

  it('needs one group per point', () => {
    expect(formula(`PrincipalAxes(${points}, "Center", List(0))`)).toContain('one group per point');
  });
});
