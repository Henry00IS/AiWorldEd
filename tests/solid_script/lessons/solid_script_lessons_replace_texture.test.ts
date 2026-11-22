import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

describe('replacing one texture with another', () => {
  it('repaints only the faces with the old texture, by Texture Faces Where on [$Face.Texture]', () => {
    const result = solidScriptProgramRun(
      solidScriptDocumentCreate([
        { command: 'cube', values: { size: '1', label: 'Wall' } },
        { command: 'select_faces', values: { which: 'Facing Up', of: 'Wall' } },
        { command: 'texture_faces', values: { texture: 'brick' } },
        {
          command: 'texture_faces',
          values: { texture: 'stone', of: 'Wall', where: '[=[$Face.Texture] == "brick"]' },
        },
        {
          command: 'select_faces',
          values: { which: 'All', of: 'Wall', where: '[=[$Face.Texture] == "stone"]', into: 'S' },
        },
        {
          command: 'select_faces',
          values: { which: 'All', of: 'Wall', where: '[=[$Face.Texture] == "brick"]', into: 'B' },
        },
        { command: 'echo', values: { value: '[S.Count] [B.Count]' } },
      ]),
    );
    expect(result.error?.message).toBeUndefined();
    expect(result.messages[0]).toBe('1 0');
  });
});
