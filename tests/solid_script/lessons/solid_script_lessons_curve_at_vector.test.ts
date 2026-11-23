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

describe('CurveAt on a vector', () => {
  it('maps every axis of a vector through the curve', () => {
    expect(formula('CurveAt(0.25, Vector(0.1, 0.5, 0.9))')).toBe('[0.25, 0.25, 0.25]');
    expect(formula('CurveAt(0.25, 0.5)')).toBe('0.25');
  });

  it('needs a number or a vector', () => {
    expect(formula('CurveAt(0.25, "middle")')).toContain('needs a Number or Vector for X');
  });
});
