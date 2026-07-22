import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FolderTextureScanner } from '../../src/texture/folder_texture_scanner.js';
import { PickedDirectoryListing } from '../../src/texture/local_directory_access.js';
import { ensureObjectUrlApis } from './object_url_test_utils.js';

describe('FolderTextureScanner', () => {
  let scanner: FolderTextureScanner;

  beforeEach(() => {
    scanner = new FolderTextureScanner();
    ensureObjectUrlApis();
    vi.spyOn(URL, 'createObjectURL').mockImplementation(
      (blob) => `blob:${(blob as File).name}`
    );
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should keep only image files and sort by display name', () => {
    const listing = createListing([
      ['readme.txt', 'readme.txt'],
      ['zebra.png', 'zebra.png'],
      ['alpha.jpg', 'subdir/alpha.jpg'],
      ['mesh.obj', 'mesh.obj']
    ]);
    const result = scanner.scanListing(listing);
    expect(result.folderName).toBe('Textures');
    expect(result.entries.map((entry) => entry.displayName)).toEqual([
      'alpha',
      'zebra'
    ]);
    expect(result.skippedNonImageCount).toBe(2);
  });

  it('should preserve relative paths as entry ids', () => {
    const listing = createListing([['tile.png', 'floors/tile.png']]);
    const result = scanner.scanListing(listing);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].id).toBe('floors/tile.png');
    expect(result.entries[0].previewObjectUrl).toBe('blob:tile.png');
  });

  it('should return zero images for an empty listing', () => {
    const result = scanner.scanListing({ folderName: 'Empty', files: [] });
    expect(result.entries).toEqual([]);
    expect(result.skippedNonImageCount).toBe(0);
  });
});

/**
 * Builds a test directory listing from name/path pairs.
 * @param pairs File name and relative path pairs.
 * @returns Synthetic listing.
 */
function createListing(
  pairs: Array<[string, string]>
): PickedDirectoryListing {
  return {
    folderName: 'Textures',
    files: pairs.map(([name, relativePath]) => ({
      name,
      relativePath,
      file: new File(['data'], name, { type: 'application/octet-stream' })
    }))
  };
}
