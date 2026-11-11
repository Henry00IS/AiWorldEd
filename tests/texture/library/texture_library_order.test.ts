import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TextureLibrary } from '@/texture/library/texture_library.js';
import { createTextureBrowserEntry, type TextureBrowserEntry } from '@/texture/library/texture_browser_entry.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import { mockObjectUrlApis } from './utils_object_url_test.js';

/**
 * Builds an entry for a texture path.
 *
 * @param id Texture id (relative path).
 * @returns Entry named after the file.
 */
function entryCreate(id: string): TextureBrowserEntry {
  return createTextureBrowserEntry(new File(['img'], id.split('/').pop() ?? id, { type: 'image/png' }), id);
}

/**
 * Lists the shown names in order.
 *
 * @param library Library.
 * @returns Display names, checker first.
 */
function namesOf(library: TextureLibrary): string[] {
  return library.getEntries().map((entry) => entry.displayName);
}

describe('TextureLibrary order', () => {
  let library: TextureLibrary;

  beforeEach(() => {
    mockObjectUrlApis('blob:order');
    library = new TextureLibrary();
  });
  afterEach(() => vi.restoreAllMocks());

  it('sorts a scanned folder by name, ignoring case and counting numbers, with the checker first', () => {
    library.replaceAll('project', [
      entryCreate('tex10.png'),
      entryCreate('walls/Brick.png'),
      entryCreate('tex2.png'),
      entryCreate('aardvark.png'),
      entryCreate('zinc.png'),
    ]);
    expect(library.getEntries()[0]?.id).toBe(DEFAULT_CHECKER_TEXTURE_ID);
    expect(namesOf(library).slice(1)).toEqual(['aardvark', 'Brick', 'tex2', 'tex10', 'zinc']);
  });

  it('keeps the order when textures are added, appended (room arrivals) and removed', () => {
    library.entriesUpsert([entryCreate('moss.png')]);
    library.entriesAppend([entryCreate('stone.png')]);
    library.entriesAppend([entryCreate('Asphalt.png')]);
    library.entriesUpsert([entryCreate('grass.png'), entryCreate('dirt.png')]);
    expect(namesOf(library).slice(1)).toEqual(['Asphalt', 'dirt', 'grass', 'moss', 'stone']);
    library.entriesRemove(new Set(['grass.png']));
    expect(namesOf(library).slice(1)).toEqual(['Asphalt', 'dirt', 'moss', 'stone']);
  });

  it('moves a renamed texture to its new place and keeps it selected', () => {
    library.entriesUpsert([entryCreate('alpha.png'), entryCreate('beta.png'), entryCreate('gamma.png')]);
    library.selectById('alpha.png');
    library.entriesUpsert([{ ...entryCreate('alpha.png'), displayName: 'omega' }]);
    expect(namesOf(library).slice(1)).toEqual(['beta', 'gamma', 'omega']);
    expect(library.getSelectedId()).toBe('alpha.png');
  });

  it('orders equal names by path so the order never depends on arrival', () => {
    library.entriesAppend([entryCreate('b/rock.png')]);
    library.entriesAppend([entryCreate('a/rock.png')]);
    expect(library.getEntries().map((entry) => entry.id)).toEqual([
      DEFAULT_CHECKER_TEXTURE_ID,
      'a/rock.png',
      'b/rock.png',
    ]);
  });
});
