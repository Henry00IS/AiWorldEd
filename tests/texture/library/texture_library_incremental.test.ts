import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TextureLibrary } from '@/texture/library/texture_library.js';
import { createTextureBrowserEntry, type TextureBrowserEntry } from '@/texture/library/texture_browser_entry.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import { mockObjectUrlApis } from './utils_object_url_test.js';

/**
 * Builds an entry for a texture id.
 *
 * @param id Texture id (relative path).
 * @returns Entry.
 */
function entryCreate(id: string): TextureBrowserEntry {
  return createTextureBrowserEntry(new File(['img'], id.split('/').pop() ?? id, { type: 'image/png' }), id);
}

describe('TextureLibrary incremental updates', () => {
  let library: TextureLibrary;

  beforeEach(() => {
    mockObjectUrlApis('blob:incremental');
    library = new TextureLibrary();
  });
  afterEach(() => vi.restoreAllMocks());

  it('adds new ids, replaces same ids in place and grows the revision once per call', () => {
    library.replaceAll('project', [entryCreate('a.png'), entryCreate('walls/b.png')]);
    const revision = library.getRevision();
    const replacement = entryCreate('a.png');
    expect(library.entriesUpsert([replacement, entryCreate('c.png')])).toBe(2);
    expect(library.getRevision()).toBe(revision + 1);
    expect(library.getEntries().map((entry) => entry.id)).toEqual([
      DEFAULT_CHECKER_TEXTURE_ID,
      'a.png',
      'walls/b.png',
      'c.png',
    ]);
    expect(library.getEntryById('a.png')).toBe(replacement);
  });

  it('revokes the preview of a replaced or removed entry', () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    library.entriesUpsert([entryCreate('a.png')]);
    library.entriesUpsert([entryCreate('a.png')]);
    library.entriesRemove(new Set(['a.png']));
    expect(revoke).toHaveBeenCalledTimes(2);
    expect(library.getEntryById('a.png')).toBeNull();
  });

  it('falls back to the checker when the selected texture is removed', () => {
    library.entriesUpsert([entryCreate('a.png')]);
    library.selectById('a.png');
    const revision = library.getRevision();
    expect(library.entriesRemove(new Set(['a.png', 'missing.png']))).toBe(1);
    expect(library.getSelectedId()).toBe(DEFAULT_CHECKER_TEXTURE_ID);
    expect(library.getRevision()).toBe(revision + 1);
    expect(library.entriesRemove(new Set(['a.png']))).toBe(0);
    expect(library.getRevision()).toBe(revision + 1);
  });

  it('notifies listeners of every change until they are removed', () => {
    const listener = vi.fn();
    const remove = library.listenerAdd(listener);
    library.entriesUpsert([entryCreate('a.png')]);
    library.folderNameSet('project');
    library.selectById('a.png');
    library.entriesRemove(new Set(['a.png']));
    expect(listener).toHaveBeenCalledTimes(4);
    remove();
    library.clear();
    expect(listener).toHaveBeenCalledTimes(4);
  });

  it('finds entries by id among thousands without scanning', () => {
    const entries = Array.from({ length: 5000 }, (_, index) => entryCreate(`t/${index}.png`));
    library.replaceAll('big', entries);
    expect(library.getEntryById('t/4999.png')).toBe(entries[4999]);
    expect(library.getEntryCount()).toBe(5001);
  });
});
