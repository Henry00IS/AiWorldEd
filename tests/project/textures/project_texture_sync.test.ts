import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectFileSystemHandle } from '@/project/fs/project_file_system_handle.js';
import { ProjectScanner } from '@/project/scan/project_scanner.js';
import { ProjectTextureSync } from '@/project/textures/project_texture_sync.js';
import { PROJECT_TEXTURE_HASHES_FILE } from '@/project/textures/project_texture_hashes.js';
import { sha256Hex } from '@/utils/utils_sha256.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import { TextureLibrary } from '@/texture/library/texture_library.js';
import { mockObjectUrlApis } from '../../texture/library/utils_object_url_test.js';
import { PROJECT_MOCK_PNG, ProjectMockDirectoryHandle } from '../fs/project_mock_directory_handle.js';

/**
 * Builds a project with two textures and a sync into a fresh library.
 *
 * @param gate Texture source gate.
 * @returns Parts of the fixture.
 */
function syncCreate(gate: () => string | null = () => null) {
  const root = new ProjectMockDirectoryHandle('game');
  root.put('wall/brick.png', PROJECT_MOCK_PNG);
  root.put('floor.png', PROJECT_MOCK_PNG);
  const fileSystem = new ProjectFileSystemHandle(root.asHandle());
  const library = new TextureLibrary();
  const sync = new ProjectTextureSync(fileSystem, library, gate);
  const scan = () => new ProjectScanner().scan(fileSystem);
  return { root, library, sync, scan };
}

/**
 * Lists library ids in order.
 *
 * @param library Library.
 * @returns Sorted ids.
 */
function ids(library: TextureLibrary): string[] {
  return library
    .getEntries()
    .map((entry) => entry.id)
    .filter((id) => id !== DEFAULT_CHECKER_TEXTURE_ID)
    .sort();
}

describe('ProjectTextureSync', () => {
  afterEach(() => vi.restoreAllMocks());

  it('loads project images under their relative paths', async () => {
    mockObjectUrlApis();
    const { library, sync, scan } = syncCreate();
    await sync.sync(await scan());
    expect(ids(library)).toEqual(['floor.png', 'wall/brick.png']);
    expect(library.getFolderName()).toBe('game');
    expect(library.getEntryById('floor.png')?.mimeType).toBe('image/png');
  });

  it('re-reads only changed files and drops removed ones', async () => {
    mockObjectUrlApis();
    const { root, library, sync, scan } = syncCreate();
    await sync.sync(await scan());
    const floor = library.getEntryById('floor.png');
    root.put('wall/brick.png', new Uint8Array([...PROJECT_MOCK_PNG, 0]));
    root.delete('floor.png');
    root.put('new/sky.png', PROJECT_MOCK_PNG);
    const reads = vi.spyOn(ProjectFileSystemHandle.prototype, 'fileRead');
    await sync.sync(await scan());
    // Changed files once each, and the hash cache.
    expect(reads.mock.calls.map((call) => call[0]).sort()).toEqual([
      PROJECT_TEXTURE_HASHES_FILE,
      'new/sky.png',
      'wall/brick.png',
    ]);
    expect(ids(library)).toEqual(['new/sky.png', 'wall/brick.png']);
    expect(floor).not.toBeNull();
  });

  it('keeps ids stable when nothing changed', async () => {
    mockObjectUrlApis();
    const { library, sync, scan } = syncCreate();
    await sync.sync(await scan());
    const revision = library.getRevision();
    await sync.sync(await scan());
    expect(library.getRevision()).toBe(revision);
  });

  it('does nothing while the room owner provides textures and catches up later', async () => {
    mockObjectUrlApis();
    let blocked: string | null = 'Textures come from the room owner';
    const { library, sync, scan } = syncCreate(() => blocked);
    await sync.sync(await scan());
    expect(ids(library)).toEqual([]);
    blocked = null;
    await sync.sync(await scan());
    expect(ids(library)).toEqual(['floor.png', 'wall/brick.png']);
  });

  it('removes its textures on stop', async () => {
    mockObjectUrlApis();
    const { library, sync, scan } = syncCreate();
    await sync.sync(await scan());
    sync.stop();
    expect(ids(library)).toEqual([]);
    await sync.sync(await scan());
    expect(ids(library)).toEqual([]);
  });

  it('gives regular files their content hash from the hash cache, hashing only what it lacks', async () => {
    mockObjectUrlApis();
    const { root, library, sync, scan } = syncCreate();
    await sync.sync(await scan());
    const hash = await sha256Hex(PROJECT_MOCK_PNG);
    expect(library.getEntryById('floor.png')?.sha256).toBe(hash);
    const fileSystem = new ProjectFileSystemHandle(root.asHandle());
    const cached = JSON.parse(await (await fileSystem.fileRead(PROJECT_TEXTURE_HASHES_FILE)).text()) as {
      files: Record<string, { sha256: string }>;
    };
    expect(cached.files['wall/brick.png']?.sha256).toBe(hash);
    // A second editor session reads the hashes from the cache, not the files.
    const again = new TextureLibrary();
    const reads = vi.spyOn(fileSystem, 'fileRead');
    await new ProjectTextureSync(fileSystem, again, () => null).sync(await scan());
    expect(again.getEntryById('wall/brick.png')?.sha256).toBe(hash);
    expect(reads.mock.calls.map(([path]) => path).filter((path) => path === 'floor.png')).toHaveLength(1);
  });
});
