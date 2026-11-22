import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/**
 * Runs Sort List on a list and echoes it.
 *
 * @param list Items of the list.
 * @param values Extra Sort List values.
 * @returns Echoed text.
 */
function sorted(list: string, values: Record<string, string>): string {
  const lines: SolidScriptLine[] = [
    { command: 'variable', values: { name: 'L', value: list } },
    { command: 'sort_list', values: { list: 'L', ...values } },
    { command: 'echo', values: { value: '[L]' } },
  ];
  const result = solidScriptProgramRun(solidScriptDocumentCreate(lines));
  if (result.error) throw new Error(result.error.message);
  return result.messages.join('|');
}

describe('Sort List By', () => {
  it('orders points by what By works out for each', () => {
    expect(sorted('[0, 3, 0], [0, 1, 0], [0, 2, 0]', { by: '[=[$Y]]' })).toMatch(/1.*2.*3/);
    expect(sorted('[0, 3, 0], [0, 1, 0], [0, 2, 0]', { by: '[=[$Y]]', descending: 'Yes' })).toMatch(/3.*2.*1/);
  });

  it('keeps the order of items with the same key', () => {
    expect(sorted('"b", "a", "c"', { by: '0' })).toMatch(/b.*a.*c/);
  });

  it('orders the items themselves when By is left off', () => {
    expect(sorted('5, 2, 9', {})).toMatch(/2.*5.*9/);
  });
});
