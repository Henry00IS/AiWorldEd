import { describe, expect, it } from 'vitest';
import {
  solidScriptDocumentCreate,
  solidScriptDocumentUsesWith,
  type SolidScriptLine,
} from '@/solid_script/document/solid_script_document.js';
import {
  solidScriptDocumentReadsBoxMember,
  solidScriptMistakeCheck,
  solidScriptUseCheck,
} from '@/solid_script/language/solid_script_use_check.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

const BOXED: SolidScriptLine = { command: 'cube', values: { size: '[$Box.Width], 1, [=[$Box.Height] / 2]' } };

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
  it('does not warn when a modifier reads Box values, because the volume is the box', () => {
    expect(warned(BOXED)).toEqual([]);
    expect(
      solidScriptUseCheck(
        solidScriptDocumentUsesWith(solidScriptDocumentCreate([BOXED]), { generator: true, modifier: true }),
      ),
    ).toEqual([]);
  });

  it('tells which Box member an active line reads, and skips lines that are off', () => {
    const script = solidScriptDocumentCreate([
      BOXED,
      { command: 'echo', values: { value: '[=[$Box.Position.X] + [$Box.Size.Y]]' } },
      { command: 'echo', values: { value: '[$Box.Rotation]' }, off: true },
    ]);
    expect(solidScriptDocumentReadsBoxMember(script, 'Width')).toBe(true);
    expect(solidScriptDocumentReadsBoxMember(script, 'Position')).toBe(true);
    expect(solidScriptDocumentReadsBoxMember(script, 'Rotation')).toBe(false);
    expect(solidScriptDocumentReadsBoxMember(solidScriptDocumentCreate([{ command: 'cube' }]), 'Position')).toBe(false);
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
    expect(run([...part, { command: 'output', values: { of: '[Post]' } }])).toMatch(/Post/);
  });
});
