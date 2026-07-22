import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TextureLibrary } from '../../src/texture/texture_library.js';
import {
  TextureBrowserEntry,
  createTextureBrowserEntry
} from '../../src/texture/texture_browser_entry.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '../../src/texture/texture_id.js';
import { mockObjectUrlApis } from './object_url_test_utils.js';

describe('TextureLibrary', () => {
  let library: TextureLibrary;

  beforeEach(() => {
    library = new TextureLibrary();
    mockObjectUrlApis('blob:lib');
  });

  afterEach(() => {
    library.clear();
    vi.restoreAllMocks();
  });

  it('should always include the built-in checker as the first entry', () => {
    expect(library.getEntryCount()).toBe(1);
    expect(library.getSelectedId()).toBe(DEFAULT_CHECKER_TEXTURE_ID);
    expect(library.getEntries()[0].id).toBe(DEFAULT_CHECKER_TEXTURE_ID);
    expect(library.getFolderName()).toBeNull();
  });

  it('should keep checker first when a folder is loaded', () => {
    const entries = [
      createEntry('b.png', 'b.png'),
      createEntry('a.png', 'a.png')
    ];
    library.replaceAll('MyFolder', entries);
    expect(library.getFolderName()).toBe('MyFolder');
    expect(library.getEntryCount()).toBe(3);
    const listed = library.getEntries();
    expect(listed[0].id).toBe(DEFAULT_CHECKER_TEXTURE_ID);
    expect(listed[1].id).toBe('b.png');
    expect(listed[2].id).toBe('a.png');
  });

  it('should revoke previous folder object URLs when replaced', () => {
    const first = [createEntry('old.png', 'old.png')];
    library.replaceAll('Old', first);
    const oldUrl = first[0].previewObjectUrl;
    library.replaceAll('New', [createEntry('new.png', 'new.png')]);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(oldUrl);
    expect(library.getEntryCount()).toBe(2);
  });

  it('should select by id only when the entry exists', () => {
    library.replaceAll('Folder', [
      createEntry('one.png', 'one.png'),
      createEntry('two.png', 'two.png')
    ]);
    expect(library.selectById('two.png')).toBe(true);
    expect(library.getSelectedEntry()?.displayName).toBe('two');
    expect(library.selectById('missing.png')).toBe(false);
    expect(library.getSelectedId()).toBe('two.png');
  });

  it('should reset selection to checker after clearing folder entries', () => {
    library.replaceAll('Folder', [createEntry('only.png', 'only.png')]);
    library.selectById('only.png');
    library.replaceAll('Empty', []);
    expect(library.getSelectedId()).toBe(DEFAULT_CHECKER_TEXTURE_ID);
    expect(library.getEntryById('only.png')).toBeNull();
    expect(library.getEntries()[0].id).toBe(DEFAULT_CHECKER_TEXTURE_ID);
  });
});

/**
 * Creates a test texture entry with a unique object URL.
 * @param fileName File name.
 * @param relativePath Relative path id.
 * @returns Browser entry.
 */
function createEntry(fileName: string, relativePath: string): TextureBrowserEntry {
  return createTextureBrowserEntry(
    new File(['img'], fileName, { type: 'image/png' }),
    relativePath
  );
}
