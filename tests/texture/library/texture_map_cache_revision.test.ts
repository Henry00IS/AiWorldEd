import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TextureMapCache } from '@/texture/library/texture_map_cache.js';
import { TextureLibrary } from '@/texture/library/texture_library.js';
import { createTextureBrowserEntry } from '@/texture/library/texture_browser_entry.js';
import { getDebugCheckerTexture } from '@/texture/library/factory_debug_texture.js';
import { mockObjectUrlApis } from './utils_object_url_test.js';

/** Image stand-in that loads as soon as its source is set. */
class ImageLoadingImmediately {
  onload: (() => void) | null = null;
  private source = '';

  /**
   * Returns the image source.
   *
   * @returns Source URL.
   */
  get src(): string {
    return this.source;
  }

  /**
   * Sets the source and fires the load callback.
   *
   * @param value Source URL.
   */
  set src(value: string) {
    this.source = value;
    this.onload?.();
  }
}

/**
 * Builds an entry for a texture id.
 *
 * @param id Texture id.
 * @returns Entry.
 */
function entryCreate(id: string): ReturnType<typeof createTextureBrowserEntry> {
  return createTextureBrowserEntry(new File(['x'], id, { type: 'image/png' }), id);
}

/**
 * Builds a cache following a library that holds the given ids.
 *
 * @param ids Texture ids.
 * @returns Library and cache.
 */
function cacheCreate(ids: readonly string[]): { library: TextureLibrary; cache: TextureMapCache } {
  const library = new TextureLibrary();
  library.replaceAll('first', ids.map(entryCreate));
  const cache = new TextureMapCache();
  cache.setLibrary(library);
  return { library, cache };
}

describe('TextureMapCache following its library', () => {
  beforeEach(() => {
    vi.stubGlobal('Image', ImageLoadingImmediately);
    mockObjectUrlApis('blob:revision');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps the same texture and swaps its image when an id names a different file', () => {
    const { library, cache } = cacheCreate(['stone.png', 'brick.png']);
    const stone = cache.resolve('stone.png');
    const brick = cache.resolve('brick.png');
    const brickImage: unknown = brick.image;
    const kept = library.getEntryById('brick.png');
    const stoneImage: unknown = stone.image;
    library.replaceAll('second', [entryCreate('stone.png'), ...(kept === null ? [] : [kept])]);
    expect(cache.resolve('stone.png')).toBe(stone);
    expect(stone.image).not.toBe(stoneImage);
    expect(brick.image).toBe(brickImage);
  });

  it('shows the checker for a removed file and the file again once it returns', () => {
    const { library, cache } = cacheCreate(['stone.png']);
    const stone = cache.resolve('stone.png');
    library.entriesRemove(new Set(['stone.png']));
    expect(stone.image).toBe(getDebugCheckerTexture().image);
    expect(cache.isPlaceholder('stone.png')).toBe(true);
    library.entriesUpsert([entryCreate('stone.png')]);
    expect(cache.resolve('stone.png')).toBe(stone);
    expect(stone.image).not.toBe(getDebugCheckerTexture().image);
    expect(cache.isPlaceholder('stone.png')).toBe(false);
  });

  it('gives a missing id a placeholder that becomes the file when it appears', () => {
    const { library, cache } = cacheCreate([]);
    const later = cache.resolve('later.png');
    expect(later).not.toBe(getDebugCheckerTexture());
    expect(later.image).toBe(getDebugCheckerTexture().image);
    library.entriesUpsert([entryCreate('later.png')]);
    expect(cache.resolve('later.png')).toBe(later);
    expect(later.image).toBeInstanceOf(ImageLoadingImmediately);
  });

  it('stops following a library once another is bound', () => {
    const { library, cache } = cacheCreate([]);
    const later = cache.resolve('later.png');
    cache.setLibrary(new TextureLibrary());
    library.entriesUpsert([entryCreate('later.png')]);
    expect(later.image).toBe(getDebugCheckerTexture().image);
  });

  it('forgets ids on request', () => {
    const { cache } = cacheCreate(['stone.png']);
    const stone = cache.resolve('stone.png');
    cache.forget(['stone.png']);
    expect(cache.resolve('stone.png')).not.toBe(stone);
  });
});
