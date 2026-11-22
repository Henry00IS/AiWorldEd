import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptGeometryLeaves } from '@/solid_script/language/solid_script_geometry.js';

/**
 * Runs a Texture block around three cubes and gives their textures.
 *
 * @param texture Texture field.
 * @returns Texture of each cube.
 */
function textures(texture: string): (string | undefined)[] {
  const cube = { command: 'cube' };
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([{ command: 'texture', values: { texture } }, cube, cube, cube, { command: 'end' }]),
  );
  if (result.error) throw new Error(result.error.message);
  return solidScriptGeometryLeaves(result.shapes).map((leaf) => leaf.texture);
}

describe('Texture per object', () => {
  it('works the texture out for each object with [$Index]', () => {
    expect(textures('[=Pick([$Index] % 2, "grass", "stone")]')).toEqual(['grass', 'stone', 'grass']);
  });

  it('leaves an object whose texture reads empty with the default', () => {
    expect(textures('[=[$Index] == 1 ? "" : "brick"]')).toEqual(['brick', undefined, 'brick']);
  });

  it('paints every object the same when the texture is plain', () => {
    expect(textures('stone')).toEqual(['stone', 'stone', 'stone']);
  });
});
