import { describe, expect, it } from 'vitest';
import {
  solidScriptDocumentCreate,
  solidScriptDocumentUsesWith,
  type SolidScriptLine,
} from '@/solid_script/document/solid_script_document.js';
import { solidScriptMistakeCheck, solidScriptUseCheck } from '@/solid_script/language/solid_script_use_check.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

const BOXED: SolidScriptLine = { command: 'cube', values: { size: '[$Box.Width], 1, [=box.height / 2]' } };

/**
 * Checks a script that may be used as a modifier.
 *
 * @param lines Lines.
 * @returns Warned lines.
 */
function warned(...lines: SolidScriptLine[]): number[] {
  const document = solidScriptDocumentUsesWith(solidScriptDocumentCreate(lines), { generator: true, modifier: true });
  return solidScriptUseCheck(document).map((warning) => warning.line ?? 0);
}

describe('solid script use check', () => {
  it('warns, without running, where a modifier would read Box values', () => {
    expect(warned(BOXED)).toEqual([1]);
    const [warning] = solidScriptUseCheck(
      solidScriptDocumentUsesWith(solidScriptDocumentCreate([BOXED]), { generator: true, modifier: true }),
    );
    expect(warning?.text).toContain('[$Box.Width]');
    expect(warning?.text).toContain('If Used As Generator');
  });

  it('respects If Used As, its Else, off lines and Can Be Used As', () => {
    const generator: SolidScriptLine = { command: 'if_used_as', values: { use: 'Generator' } };
    const modifier: SolidScriptLine = { command: 'if_used_as', values: { use: 'Modifier' } };
    const end: SolidScriptLine = { command: 'end' };
    expect(warned(generator, BOXED, end)).toEqual([]);
    expect(warned(generator, { command: 'sphere' }, { command: 'else' }, BOXED, end)).toEqual([4]);
    expect(warned(modifier, BOXED, end)).toEqual([2]);
    expect(warned(modifier, { command: 'sphere' }, { command: 'else' }, BOXED, end)).toEqual([]);
    expect(warned({ ...BOXED, off: true })).toEqual([]);
    expect(solidScriptUseCheck(solidScriptDocumentCreate([BOXED]))).toEqual([]);
  });
});

describe('solid script checks skip lines turned off', () => {
  it('reads no Box value or mistake from an off line', () => {
    expect(warned({ ...BOXED, off: true }, { command: 'cube' })).toEqual([]);
    expect(
      solidScriptMistakeCheck(solidScriptDocumentCreate([{ command: 'cube', values: { size: '[K]*2' }, off: true }])),
    ).toEqual([]);
  });

  it('registers no Function or Part of an off line when the script runs', () => {
    const run = (lines: SolidScriptLine[]) =>
      solidScriptProgramRun(solidScriptDocumentCreate([...lines, { command: 'cube' }])).error?.message ?? '';
    const fat: SolidScriptLine[] = [
      { command: 'function', values: { name: 'Fat', parameters: 'Thickness' }, off: true },
      { command: 'return', values: { value: '[Local.Thickness]' }, off: true },
      { command: 'end', off: true },
    ];
    expect(run([...fat, { command: 'call', values: { name: 'Fat', values: '2' } }])).toMatch(/Fat/);
    expect(run([...fat, { command: 'echo', values: { value: '[=Fat(2)]' } }])).toMatch(/Fat/);
    const part: SolidScriptLine[] = [
      { command: 'part', values: { name: 'Post' }, off: true },
      { command: 'end', off: true },
    ];
    expect(run([...part, { command: 'use_part', values: { name: 'Post' } }])).toMatch(/Post/);
  });
});
