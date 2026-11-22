import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/**
 * Echoes one formula and gives the text or the mistake.
 *
 * @param formula Formula, such as [=ItemClamp([1, 2], 5)].
 * @returns Echoed text, or the mistake.
 */
function echoed(formula: string): string {
  const result = solidScriptProgramRun(solidScriptDocumentCreate([{ command: 'echo', values: { value: formula } }]));
  return result.error?.message ?? result.messages.join('|');
}

describe('ItemClamp and ItemWrap', () => {
  it('clamps an index outside the list to the first or last item', () => {
    expect(echoed('[=ItemClamp([1, 2, 3], 5)]')).toBe('3');
    expect(echoed('[=ItemClamp([1, 2, 3], -2)]')).toBe('1');
    expect(echoed('[=ItemClamp([1, 2, 3], 1)]')).toBe('2');
  });

  it('wraps an index past either end', () => {
    expect(echoed('[=ItemWrap([1, 2, 3], 3)]')).toBe('1');
    expect(echoed('[=ItemWrap([1, 2, 3], -1)]')).toBe('3');
  });

  it('stops on an empty list', () => {
    expect(echoed('[=ItemWrap([], 0)]')).toMatch(/at least one item/);
  });
});
