import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

describe('blocks that bake their lines', () => {
  it('bake what later lines inside them did, such as a Move By of a named solid', () => {
    const result = solidScriptProgramRun(
      solidScriptDocumentCreate([
        { command: 'mesh_from_solids' },
        { command: 'cube', values: { size: '1' } },
        { command: 'cube', values: { size: '1', label: 'Far' } },
        { command: 'move_by', values: { by: '3, 0, 0', of: 'Far' } },
        { command: 'end' },
        { command: 'select_objects', values: { into: 'O' } },
        { command: 'echo', values: { value: '[O.Count] [O(0).Size] [O(0).Islands.Count]' } },
      ]),
    );
    expect(result.error?.message).toBeUndefined();
    expect(result.messages).toEqual(['1 [4, 1, 1] 2']);
  });
});
