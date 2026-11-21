import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

const line = (command: string, values: Record<string, string> = {}): SolidScriptLine => ({ command, values });

/**
 * Evaluates one formula and returns what Echo prints, or the error.
 *
 * @param formula Formula without [= ].
 * @returns Printed value.
 */
function formula(formula: string): string {
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([line('echo', { value: `[=${formula}]` }), line('cube')]),
    {},
  );
  return result.error ? result.error.message : (result.messages[0] ?? '');
}

describe('ResampleEvery', () => {
  it('places points a fixed distance apart and keeps the end as a shorter last step', () => {
    expect(formula('Len(ResampleEvery(List(List(0, 0, 0), List(1, 0, 0)), 0.4))')).toBe('4');
    expect(formula('Round(ItemOr(ResampleEvery(List(List(0, 0, 0), List(1, 0, 0)), 0.4), 2, 0).X * 100)')).toBe('80');
    expect(formula('ItemOr(ResampleEvery(List(List(0, 0, 0), List(1, 0, 0)), 0.4), 3, 0).X')).toBe('1');
  });

  it('gives no extra point when the distance divides the length', () => {
    expect(formula('Len(ResampleEvery(List(List(0, 0, 0), List(1, 0, 0), List(1, 1, 0)), 0.5))')).toBe('5');
    expect(formula('ItemOr(ResampleEvery(List(List(0, 0, 0), List(1, 0, 0), List(1, 1, 0)), 0.5), 3, 0)')).toContain(
      '0.5',
    );
  });

  it('stops on a distance below 0.01', () => {
    expect(formula('ResampleEvery(List(List(0, 0, 0), List(1, 0, 0)), 0)')).toContain('at least 0.01');
  });
});
