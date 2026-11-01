import { describe, expect, it } from 'vitest';
import { projectSnapshotFromEntries } from '@/project/scan/project_snapshot_entries.js';
import { createTextureBrowserEntry } from '@/texture/library/texture_browser_entry.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import { mockObjectUrlApis } from '../../texture/library/utils_object_url_test.js';

/**
 * Builds a library entry for a path.
 *
 * @param path Texture id.
 * @param body File contents.
 * @returns Entry.
 */
function entryOf(path: string, body: string = 'x') {
  return createTextureBrowserEntry(new File([body], path, { type: 'image/png', lastModified: 42 }), path);
}

describe('projectSnapshotFromEntries', () => {
  it("lists the room owner's textures with their folders and skips the checker", () => {
    mockObjectUrlApis('blob:snap');
    const snapshot = projectSnapshotFromEntries([
      entryOf(DEFAULT_CHECKER_TEXTURE_ID),
      entryOf('walls/stone/a.png', 'abc'),
      entryOf('top.png'),
    ]);
    expect([...snapshot.files.keys()].sort()).toEqual(['top.png', 'walls/stone/a.png']);
    expect([...snapshot.directories].sort()).toEqual(['walls', 'walls/stone']);
    expect(snapshot.files.get('walls/stone/a.png')).toEqual({
      path: 'walls/stone/a.png',
      name: 'a.png',
      directory: 'walls/stone',
      kind: 'texture',
      size: 3,
      lastModified: 42,
    });
  });
});
