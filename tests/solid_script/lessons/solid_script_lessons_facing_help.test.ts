import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptWhereHelper } from '@/solid_script/language/solid_script_where_helpers.js';
import { SOLID_SCRIPT_FACING_WITHIN_DEFAULT } from '@/solid_script/language/solid_script_condition.js';

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

describe('Facing as the angle comparison of two directions', () => {
  it('names the Within default it uses in its help', () => {
    expect(solidScriptWhereHelper('facing')?.description).toContain(`${SOLID_SCRIPT_FACING_WITHIN_DEFAULT} by default`);
  });

  it('leans up to the default Within and no further, whatever the lengths', () => {
    const lean = (degrees: number) => `Facing(Vector(Sin(${degrees}), Cos(${degrees}), 0) * 5, Vector(0, 2, 0))`;
    expect(formula(lean(SOLID_SCRIPT_FACING_WITHIN_DEFAULT - 1))).toBe('Yes');
    expect(formula(lean(SOLID_SCRIPT_FACING_WITHIN_DEFAULT + 1))).toBe('No');
  });
});
