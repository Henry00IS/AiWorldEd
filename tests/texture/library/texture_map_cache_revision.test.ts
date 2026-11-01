import { afterEach, describe, expect, it, vi } from 'vitest';
import { TextureMapCache } from '@/texture/library/texture_map_cache.js';
import { TextureLibrary } from '@/texture/library/texture_library.js';
import { createTextureBrowserEntry } from '@/texture/library/texture_browser_entry.js';
import { mockObjectUrlApis } from './utils_object_url_test.js';

/**
 * Builds an entry for a texture id.
 *
 * @param id Texture id.
 * @returns Entry.
 */
function entryCreate(id: string): ReturnType<typeof createTextureBrowserEntry> {
  return createTextureBrowserEntry(new File(['x'], id, { type: 'image/png' }), id);
}

describe('TextureMapCache after a folder switch', () => {
  afterEach(() => vi.restoreAllMocks());

  it('drops a cached map whose id now names a different file', () => {
    mockObjectUrlApis('blob:revision');
    const library = new TextureLibrary();
    library.replaceAll('first', [entryCreate('stone.png'), entryCreate('brick.png')]);
    const cache = new TextureMapCache();
    cache.setLibrary(library);
    const stone = cache.resolve('stone.png');
    const brick = cache.resolve('brick.png');
    const kept = library.getEntryById('brick.png');
    library.replaceAll('second', [entryCreate('stone.png'), ...(kept === null ? [] : [kept])]);
    cache.pruneMissingLibraryEntries();
    expect(cache.resolve('stone.png')).not.toBe(stone);
    expect(cache.resolve('brick.png')).toBe(brick);
  });

  it('forgets ids on request', () => {
    mockObjectUrlApis('blob:forget');
    const library = new TextureLibrary();
    library.replaceAll('first', [entryCreate('stone.png')]);
    const cache = new TextureMapCache();
    cache.setLibrary(library);
    const stone = cache.resolve('stone.png');
    cache.forget(['stone.png']);
    expect(cache.resolve('stone.png')).not.toBe(stone);
  });
});
