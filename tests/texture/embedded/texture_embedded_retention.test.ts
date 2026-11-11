import { beforeEach, describe, expect, it } from 'vitest';
import { textureEmbeddedAdd } from '@/texture/embedded/texture_embedded_library.js';
import { TextureEmbeddedRetention } from '@/texture/embedded/texture_embedded_retention.js';
import { TextureLibrary } from '@/texture/library/texture_library.js';
import { mockObjectUrlApis } from '../library/utils_object_url_test.js';

/**
 * Runs both halves of a save over the level file.
 *
 * @param retention Retention.
 * @param saved Ids the new file holds.
 */
async function overwrite(retention: TextureEmbeddedRetention, saved: string[]): Promise<void> {
  await retention.beforeOverwrite(saved);
  retention.overwritten(saved);
}

/**
 * Builds an embedded texture id.
 *
 * @param letter Hash digit.
 * @returns Id.
 */
function id(letter: string): string {
  return `embedded:${letter.repeat(64)}.png`;
}

let library: TextureLibrary;
let references: Set<string> | null;
let retention: TextureEmbeddedRetention;

beforeEach(() => {
  mockObjectUrlApis();
  library = new TextureLibrary();
  textureEmbeddedAdd(
    library,
    ['a', 'b', 'c'].map((letter) => ({ id: id(letter), name: letter, blob: new Blob([letter]) })),
  );
  references = new Set();
  retention = new TextureEmbeddedRetention({ library: () => library, references: () => references });
  retention.backedByFile([id('a'), id('b'), id('c')]);
});

describe('TextureEmbeddedRetention', () => {
  it('keeps saved textures, holds the ones still used in memory and drops unused ones', async () => {
    references = new Set([id('b')]);
    const saved = library.getEntryById(id('a'))!.sourceFile;
    const used = library.getEntryById(id('b'))!.sourceFile;
    await overwrite(retention, [id('a')]);
    expect(library.getEntryById(id('a'))!.sourceFile).toBe(saved);
    expect(library.getEntryById(id('b'))!.sourceFile).not.toBe(used);
    expect(await library.getEntryById(id('b'))!.sourceFile.text()).toBe('b');
    expect(library.getEntryById(id('c'))).toBeNull();
  });

  it('changes nothing the Texture Browser lists before the write succeeded', async () => {
    references = new Set([id('b')]);
    await retention.beforeOverwrite([id('a')]);
    expect(await library.getEntryById(id('b'))!.sourceFile.text()).toBe('b');
    expect(library.getEntryById(id('c'))).not.toBeNull();
    retention.overwritten([id('a')]);
    expect(library.getEntryById(id('c'))).toBeNull();
  });

  it('releases a held texture once nothing uses it, and keeps it while something does', async () => {
    references = new Set([id('b')]);
    await overwrite(retention, [id('a')]);
    retention.release();
    expect(library.getEntryById(id('b'))).not.toBeNull();
    references = new Set();
    retention.release();
    expect(library.getEntryById(id('b'))).toBeNull();
    expect(library.getEntryById(id('a'))).not.toBeNull();
  });

  it('holds every left-out texture when the references are unknown', async () => {
    references = null;
    await overwrite(retention, []);
    retention.release();
    expect(['a', 'b', 'c'].map((letter) => library.getEntryById(id(letter)) !== null)).toEqual([true, true, true]);
  });

  it('stops holding a texture that a later save writes into the file again', async () => {
    references = new Set([id('b')]);
    await overwrite(retention, [id('a')]);
    retention.backedByFile([id('b')]);
    references = new Set();
    retention.release();
    expect(library.getEntryById(id('b'))).not.toBeNull();
  });
});
