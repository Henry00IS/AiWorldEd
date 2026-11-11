import { describe, expect, it } from 'vitest';
import { ProjectFileSystemHandle } from '@/project/fs/project_file_system_handle.js';
import { projectTextureCacheCleanup } from '@/project/textures/cache/project_texture_cache_cleanup.js';
import { ProjectTextureScanPace } from '@/project/textures/cache/project_texture_cache_scan.js';
import { ProjectMockDirectoryHandle } from '../../fs/project_mock_directory_handle.js';

const CACHE = 'AiWorldEd/.Local/TextureCache';
const NOW = 1_900_000_000_000;

/**
 * Returns a fake hash.
 *
 * @param letter Hex digit repeated.
 * @returns 64-character hash.
 */
function hashOf(letter: string): string {
  return letter.repeat(64);
}

/**
 * Builds a project with cached textures a, b, c, d and e: a is named by the
 * autosave, b by an autosave copy, c by a room snapshot, d by nothing and e by
 * nothing but written just now.
 *
 * @returns Folder root and file system.
 */
function setup() {
  const root = new ProjectMockDirectoryHandle('game');
  for (const letter of ['a', 'b', 'c', 'd', 'e']) {
    root.put(`${CACHE}/${hashOf(letter)}.png`, 'png');
    root.put(`${CACHE}/${hashOf(letter)}.json`, '{"name":"x"}');
  }
  (root.handleAt(`${CACHE}/${hashOf('e')}.png`) as { lastModified: number }).lastModified = NOW - 1000;
  root.put('AiWorldEd/.Local/Autosave/level.autosave.json', `{"data":{"textureId":"embedded:${hashOf('a')}.png"}}`);
  root.put('AiWorldEd/.Local/Autosave/History/level/1.json', `"embedded:${hashOf('b')}.png"`);
  root.put('AiWorldEd/.Local/Snapshots/s.json', `"embedded:${hashOf('c')}.png"`);
  root.put(`${CACHE}/notes.txt`, 'mine');
  return { root, fileSystem: new ProjectFileSystemHandle(root.asHandle()) };
}

/**
 * Lists the cache's file names.
 *
 * @param root Folder root.
 * @returns Sorted names.
 */
function cacheNames(root: ProjectMockDirectoryHandle): string[] {
  const folder = root.handleAt(CACHE) as ProjectMockDirectoryHandle;
  return [...folder.children.keys()].sort();
}

describe('projectTextureCacheCleanup', () => {
  it('deletes cached textures no autosave, copy or snapshot names, except recent ones', async () => {
    const { root, fileSystem } = setup();
    const deleted = await projectTextureCacheCleanup({
      fileSystem,
      live: () => [],
      pace: new ProjectTextureScanPace(),
      allowed: () => true,
      now: () => NOW,
    });
    expect(deleted.sort()).toEqual([`${hashOf('d')}.json`, `${hashOf('d')}.png`]);
    expect(cacheNames(root)).not.toContain(`${hashOf('d')}.png`);
    expect(cacheNames(root)).toContain(`${hashOf('e')}.png`);
    expect(cacheNames(root)).toContain('notes.txt');
  });

  it('keeps textures the open scene or its undo history uses', async () => {
    const { root, fileSystem } = setup();
    await projectTextureCacheCleanup({
      fileSystem,
      live: () => [`embedded:${hashOf('d')}.jpg`],
      pace: new ProjectTextureScanPace(),
      allowed: () => true,
      now: () => NOW,
    });
    expect(cacheNames(root)).toContain(`${hashOf('d')}.png`);
  });

  it('deletes nothing when an autosave cannot be read', async () => {
    const { root, fileSystem } = setup();
    const broken = Object.create(fileSystem) as typeof fileSystem;
    broken.fileRead = async (path) => {
      if (path.endsWith('s.json')) throw new Error('locked');
      return fileSystem.fileRead(path);
    };
    const pass = projectTextureCacheCleanup({
      fileSystem: broken,
      live: () => [],
      pace: new ProjectTextureScanPace(),
      allowed: () => true,
      now: () => NOW,
    });
    await expect(pass).rejects.toThrow('locked');
    expect(cacheNames(root)).toHaveLength(11);
  });

  it('stops before deleting once no longer allowed, and does nothing without a cache', async () => {
    const { root, fileSystem } = setup();
    const deps = { fileSystem, live: () => [], pace: new ProjectTextureScanPace(), now: () => NOW };
    expect(await projectTextureCacheCleanup({ ...deps, allowed: () => false })).toEqual([]);
    expect(cacheNames(root)).toHaveLength(11);
    const empty = new ProjectFileSystemHandle(new ProjectMockDirectoryHandle('empty').asHandle());
    expect(await projectTextureCacheCleanup({ ...deps, fileSystem: empty, allowed: () => true })).toEqual([]);
  });
});
