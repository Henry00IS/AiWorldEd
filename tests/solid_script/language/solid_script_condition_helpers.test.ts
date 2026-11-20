import { describe, expect, it } from 'vitest';
import { SOLID_SCRIPT_CONDITION_HELPERS } from '@/solid_script/language/solid_script_condition_helpers.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';

const EVERY_NTH = SOLID_SCRIPT_CONDITION_HELPERS.find((helper) => helper.key === 'every_nth')!;

/**
 * Keeps the items of a list of 6 that pass EveryNth, through Filter List.
 *
 * @param step Step.
 * @param start Start, or null to leave it off.
 * @returns Kept item numbers, from 0.
 */
function kept(step: number, start: number | null): number[] {
  const where = start === null ? `[=EveryNth([$Index], ${step})]` : `[=EveryNth([$Index], ${step}, ${start})]`;
  const run = solidScriptProgramRun(
    solidScriptDocumentCreate([
      { command: 'filter_list', values: { list: '0, 1, 2, 3, 4, 5', where, into: 'Kept' } },
      { command: 'echo', values: { value: '[=Join([Kept], " ")]' } },
      { command: 'cube', values: {} },
    ]),
  );
  expect(run.error).toBeNull();
  return run.messages[0]!.split(' ')
    .filter((item) => item !== '')
    .map(Number);
}

/**
 * Reads a list of item numbers written as 1, 3 and 5.
 *
 * @param text Written list.
 * @returns Numbers.
 */
function items(text: string): number[] {
  return text.split(/, | and /).map(Number);
}

describe('SolidScript Every Nth docs', () => {
  it('keeps the items its description names, of 6 items', () => {
    const pattern = /EveryNth\(\[\$Index\], (\d+)(?:, (\d+))?\) keeps items ([\d, and]+\d)/g;
    const claims = [...EVERY_NTH.description.matchAll(pattern)];
    expect(claims.length).toBe(2);
    for (const [, step, start, list] of claims)
      expect(kept(Number(step), start === undefined ? null : Number(start))).toEqual(items(list!));
  });

  it('keeps what the Step and Start hints say', () => {
    const [, step, start] = EVERY_NTH.inputs;
    expect(step!.about).toMatch(/1 keeps every item, 2 every second, 3 every third/);
    expect(kept(1, null)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(kept(2, null)).toEqual([0, 2, 4]);
    expect(kept(3, null)).toEqual([0, 3]);
    const claim = /with Step (\d+), Start (\d+) keeps items ([\d, and]+\d)/.exec(start!.about)!;
    expect(kept(Number(claim[1]), Number(claim[2]))).toEqual(items(claim[3]!));
    expect(start!.about).toMatch(/every Step-th item before and after it/);
    expect(kept(2, 4)).toEqual([0, 2, 4]);
  });
});
