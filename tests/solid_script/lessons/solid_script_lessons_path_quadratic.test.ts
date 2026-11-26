import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/**
 * Builds a Quadratic path and prints what Echo reads.
 *
 * @param values Path values besides Shape and Into.
 * @param echo What to print.
 * @returns Printed text, or the error.
 */
function quadratic(values: Record<string, string>, echo: string): string {
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([
      { command: 'quadratic_path', values: { into: 'P', ...values } },
      { command: 'echo', values: { value: echo } },
      { command: 'cube' },
    ]),
  );
  return result.error?.message ?? result.messages[0] ?? '';
}

describe('Path Quadratic', () => {
  it('runs from From to To, pulled toward Middle, halfway between them at its middle point', () => {
    const values = { from: '0, 0, 0', middle: '1, 2, 0', to: '2, 0, 0', count: '3' };
    expect(quadratic(values, '[P.Points]')).toBe('[[0, 0, 0], [1, 1, 0], [2, 0, 0]]');
  });

  it('writes Count points', () => {
    expect(quadratic({ count: '9' }, '[P.Points.Count]')).toBe('9');
  });
});
