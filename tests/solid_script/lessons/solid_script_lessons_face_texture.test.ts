import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptMemberType } from '@/solid_script/language/solid_script_members.js';

const line = (command: string, values: Record<string, string> = {}): SolidScriptLine => ({ command, values });

/**
 * Runs lines and returns what Echo printed, failing on a stop.
 *
 * @param lines Script lines.
 * @returns Printed messages.
 */
function printed(...lines: SolidScriptLine[]): string[] {
  const result = solidScriptProgramRun(solidScriptDocumentCreate(lines));
  expect(result.error?.message ?? null).toBeNull();
  return result.messages;
}

const GRASS_TOP = [
  line('cube', { size: '2, 2, 2', into: 'Box' }),
  line('select_faces', { which: 'Facing Up', of: '[Box]' }),
  line('texture_faces', { texture: 'grass' }),
];

describe('reading face textures', () => {
  it('declares Face.Texture and Object.Textures', () => {
    expect(solidScriptMemberType('Face', 'Texture')).toBe('Text');
    expect(solidScriptMemberType('Face List', 'Textures')).toBe('Text List');
    expect(solidScriptMemberType('Object', 'Textures')).toBe('Text List');
  });

  it('reads the texture Texture Faces gave, and empty for the generator texture', () => {
    expect(
      printed(
        ...GRASS_TOP,
        line('select_faces', { which: 'All', of: '[Box]', where: '[=[$Face.Texture] == "grass"]', into: 'Grass' }),
        line('echo', { value: '[Grass.Count]|[Grass.First.Normal]|[Box.Textures]' }),
        line('select_faces', { which: 'All', of: '[Box]', where: '[=[$Face.Texture] == ""]' }),
        line('echo', { value: '[$Selected.Faces.Count]' }),
      ),
    ).toEqual(['1|[0, 1, 0]|[grass]', '5']);
  });

  it('reads the texture of a Texture block after its End, and a later face texture wins', () => {
    expect(
      printed(
        line('texture', { texture: 'stone' }),
        line('cube', { size: '2, 2, 2' }),
        line('select_objects'),
        line('select_faces', { which: 'Facing Up' }),
        line('texture_faces', { texture: 'grass' }),
        line('end'),
        line('select_objects', { into: 'Box' }),
        line('echo', { value: '[Box.First.Textures]' }),
        line('select_faces', { which: 'Facing Up', of: '[Box]' }),
        line('texture_faces', { texture: 'moss' }),
        line('echo', { value: '[Box.First.Faces.Textures]' }),
      ),
    ).toEqual(['[stone, grass]', '[stone, moss, stone, stone, stone, stone]']);
  });
});
