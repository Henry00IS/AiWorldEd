import { describe, expect, it } from 'vitest';
import {
  solidScriptDocumentCreate,
  solidScriptDocumentNormalize,
  solidScriptDocumentUseProblem,
  solidScriptDocumentUses,
  solidScriptDocumentUsesWith,
} from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptFileDecode, solidScriptFileEncode } from '@/solid_script/file/solid_script_file.js';

describe('Can Be Used As', () => {
  const plain = solidScriptDocumentCreate([{ command: 'cube' }], 'Box');

  it('makes an older script a generator only, stores nothing for it, and never allows no use at all', () => {
    expect(solidScriptDocumentUses(plain)).toEqual({ generator: true, modifier: false });
    expect('uses' in solidScriptDocumentNormalize(plain)).toBe(false);
    const both = solidScriptDocumentUsesWith(plain, { generator: true, modifier: true });
    expect(solidScriptDocumentNormalize(both).uses).toEqual({ generator: true, modifier: true });
    const none = solidScriptDocumentNormalize({ ...plain, uses: { generator: false, modifier: false } });
    expect(solidScriptDocumentUses(none)).toEqual({ generator: true, modifier: false });
  });

  it('says in words why a script may not be used in a place', () => {
    expect(solidScriptDocumentUseProblem(plain, 'generator')).toBe('');
    expect(solidScriptDocumentUseProblem(plain, 'modifier')).toContain('Turn on Modifier under Can Be Used As');
    const modifierOnly = solidScriptDocumentUsesWith(plain, { generator: false, modifier: true });
    expect(solidScriptDocumentUseProblem(modifierOnly, 'generator')).toContain('Turn on Generator');
  });

  it('keeps the uses in a script file', async () => {
    const both = solidScriptDocumentUsesWith(plain, { generator: true, modifier: true });
    expect((await solidScriptFileDecode(await solidScriptFileEncode(both))).uses).toEqual(both.uses);
  });

  it('runs the lines of If Used As for the use, an Else for the other, and reads Script.Usage', () => {
    const script = solidScriptDocumentCreate([
      { command: 'if_used_as', values: { use: 'Modifier' } },
      { command: 'echo', values: { value: 'modifier [Script.Usage] [Input.Brushes().Count]' } },
      { command: 'else' },
      { command: 'echo', values: { value: 'generator [Script.Usage] [Input.Brushes().Count]' } },
      { command: 'cube' },
      { command: 'end' },
    ]);
    expect(solidScriptProgramRun(script).messages).toEqual(['generator Generator 0']);
    const solids = [
      [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ] as [number, number, number][],
    ];
    const modifier = solidScriptProgramRun(script, { use: { usage: 'Modifier', solids, faces: 4 } });
    expect(modifier.error).toBeNull();
    expect(modifier.messages).toEqual(['modifier Modifier 1']);
  });
});
