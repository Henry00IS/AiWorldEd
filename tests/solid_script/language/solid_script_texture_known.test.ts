import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptTextureUnknownWarning } from '@/solid_script/language/solid_script_texture_known.js';
import { TextureMapCache, setTextureMapCacheForTests } from '@/texture/library/texture_map_cache.js';
import { TextureLibrary } from '@/texture/library/texture_library.js';
import { createTextureBrowserEntry } from '@/texture/library/texture_browser_entry.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import { mockObjectUrlApis } from '../../texture/library/utils_object_url_test.js';

const CUBE: SolidScriptLine = { command: 'cube' };
const END: SolidScriptLine = { command: 'end' };

/**
 * Runs script lines.
 *
 * @param lines Lines.
 * @returns Run result.
 */
function run(...lines: SolidScriptLine[]) {
  return solidScriptProgramRun(solidScriptDocumentCreate(lines));
}

/**
 * Returns the warnings of a run tied to a line.
 *
 * @param result Run result.
 * @returns Warnings with their line.
 */
function lineWarnings(result: ReturnType<typeof run>) {
  return result.warnings.filter((warning) => warning.line !== null);
}

/** Opens a texture library holding one texture, walls/brick.png. */
function libraryOpen(): void {
  mockObjectUrlApis('blob:known');
  const library = new TextureLibrary();
  library.replaceAll('Game', [
    createTextureBrowserEntry(new File(['x'], 'brick.png', { type: 'image/png' }), 'walls/brick.png'),
  ]);
  const cache = new TextureMapCache();
  cache.setLibrary(library);
  setTextureMapCacheForTests(cache);
}

describe('SolidScript texture names the project does not have', () => {
  beforeEach(libraryOpen);
  afterEach(() => setTextureMapCacheForTests(null));

  it('warns on the Texture line for an unknown name and still paints with it', () => {
    const result = run({ command: 'texture', values: { texture: 'NoSuchTexture' } }, CUBE, END);
    expect(result.error).toBeNull();
    expect(result.shapes).toHaveLength(1);
    expect(lineWarnings(result)).toEqual([{ line: 1, text: 'No texture named "NoSuchTexture" in this project.' }]);
  });

  it('knows a texture by its full id and by its file name', () => {
    expect(lineWarnings(run({ command: 'texture', values: { texture: 'walls/brick.png' } }, CUBE, END))).toEqual([]);
    expect(lineWarnings(run({ command: 'texture', values: { texture: 'brick.png' } }, CUBE, END))).toEqual([]);
    expect(solidScriptTextureUnknownWarning(DEFAULT_CHECKER_TEXTURE_ID)).toBeNull();
  });

  it('warns on a Texture Faces line for an unknown name', () => {
    const result = run(
      { command: 'cube', values: { into: 'Box' } },
      { command: 'texture_faces', values: { texture: 'Grass', of: '[Box]' } },
    );
    expect(result.error).toBeNull();
    expect(lineWarnings(result)).toEqual([{ line: 2, text: 'No texture named "Grass" in this project.' }]);
  });

  it('does not warn while no texture library is open', () => {
    setTextureMapCacheForTests(new TextureMapCache());
    expect(solidScriptTextureUnknownWarning('NoSuchTexture')).toBeNull();
    expect(lineWarnings(run({ command: 'texture', values: { texture: 'NoSuchTexture' } }, CUBE, END))).toEqual([]);
  });
});
