import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

describe('For Each Where', () => {
  it('runs only for items that pass Where, with Key keeping the index in the whole list', () => {
    const result = solidScriptProgramRun(
      solidScriptDocumentCreate([
        { command: 'for_each', values: { variable: 'N', key: 'K', list: '5, 10, 15, 20', where: '[=[$Item] > 10]' } },
        { command: 'echo', values: { value: '[K] [N]' } },
        { command: 'end' },
      ]),
    );
    expect(result.error?.message).toBeUndefined();
    expect(result.messages).toEqual(['2 15', '3 20']);
  });

  it('may pick geometry items by their members', () => {
    const result = solidScriptProgramRun(
      solidScriptDocumentCreate([
        { command: 'cube', values: { size: '1', into: 'C' } },
        { command: 'for_each', values: { variable: 'F', list: '[C.Faces]', where: '[=[$Item.Normal.Y] > 0.5]' } },
        { command: 'echo', values: { value: '[F.Normal.Y]' } },
        { command: 'end' },
      ]),
    );
    expect(result.error?.message).toBeUndefined();
    expect(result.messages).toEqual(['1']);
  });
});
