import { describe, expect, it } from 'vitest';
import { ProjectFileSystemHandle } from '@/project/fs/project_file_system_handle.js';
import {
  projectTextureCacheIds,
  projectTextureCacheKeep,
  projectTextureCacheRestore,
} from '@/project/textures/cache/project_texture_cache.js';
import { textureEmbeddedAdd } from '@/texture/embedded/texture_embedded_library.js';
import { TextureLibrary } from '@/texture/library/texture_library.js';
import { sha256HexSync } from '@/utils/utils_sha256.js';
import { pngHeaderCreate } from '../../../collaboration/session/texture_collaboration_fixture.js';
import { ProjectMockDirectoryHandle } from '../../fs/project_mock_directory_handle.js';

const PNG = pngHeaderCreate(8, 8);
const HASH = sha256HexSync(PNG);
const ID = `embedded:${HASH}.png`;
const SCENE = { objects: [{ textureId: ID }, { textureId: 'walls/brick.png' }] };

/**
 * Builds a project folder and a library holding the embedded test texture.
 *
 * @returns Folder root, file system and library.
 */
function setup() {
  const root = new ProjectMockDirectoryHandle('game');
  const fileSystem = new ProjectFileSystemHandle(root.asHandle());
  const library = new TextureLibrary();
  textureEmbeddedAdd(library, [
    { id: ID, name: 'crate', blob: new Blob([new Uint8Array(PNG)], { type: 'image/png' }) },
  ]);
  return { root, fileSystem, library };
}

describe('project texture cache', () => {
  it('lists only embedded ids', () => {
    expect(projectTextureCacheIds(SCENE)).toEqual([ID]);
  });

  it('copies the embedded textures a scene uses once, with their names', async () => {
    const { root, fileSystem, library } = setup();
    await projectTextureCacheKeep(fileSystem, library, SCENE);
    const image = root.handleAt(`AiWorldEd/.Local/TextureCache/${HASH}.png`) as { lastModified: number };
    expect(image).toBeDefined();
    expect(JSON.parse((await root.textAt(`AiWorldEd/.Local/TextureCache/${HASH}.json`))!)).toEqual({ name: 'crate' });
    const written = image.lastModified;
    await projectTextureCacheKeep(fileSystem, library, SCENE);
    expect((root.handleAt(`AiWorldEd/.Local/TextureCache/${HASH}.png`) as { lastModified: number }).lastModified).toBe(
      written,
    );
    expect(await root.textAt('AiWorldEd/.gitignore')).toBe('.Local/\n');
  });

  it('skips textures whose bytes cannot be read and writes nothing without embedded ids', async () => {
    const { root, fileSystem } = setup();
    const library = new TextureLibrary();
    const broken = new Blob([new Uint8Array(PNG)]);
    broken.arrayBuffer = () => Promise.reject(new Error('NotReadableError'));
    textureEmbeddedAdd(library, [{ id: ID, name: 'crate', blob: broken }]);
    library.getEntryById(ID)!.sourceFile = broken as File;
    await projectTextureCacheKeep(fileSystem, library, SCENE);
    expect(root.handleAt(`AiWorldEd/.Local/TextureCache/${HASH}.png`)).toBeUndefined();
    const empty = setup();
    await projectTextureCacheKeep(empty.fileSystem, empty.library, { objects: [{ textureId: 'walls/brick.png' }] });
    expect(empty.root.handleAt('AiWorldEd')).toBeUndefined();
  });

  it('lists cached textures the library lacks, by name, and skips damaged ones', async () => {
    const { root, fileSystem, library } = setup();
    await projectTextureCacheKeep(fileSystem, library, SCENE);
    const other = pngHeaderCreate(4, 4);
    const otherId = `embedded:${sha256HexSync(other)}.png`;
    root.put(`AiWorldEd/.Local/TextureCache/${sha256HexSync(other)}.png`, pngHeaderCreate(5, 5));
    const fresh = new TextureLibrary();
    const restored = await projectTextureCacheRestore(fileSystem, fresh, {
      a: { textureId: ID },
      b: { textureId: otherId },
    });
    expect(restored).toBe(1);
    expect(fresh.getEntryById(ID)?.displayName).toBe('crate');
    expect(new Uint8Array(await fresh.getEntryById(ID)!.sourceFile.arrayBuffer())).toEqual(PNG);
    expect(fresh.getEntryById(otherId)).toBeNull();
    expect(await projectTextureCacheRestore(fileSystem, fresh, SCENE)).toBe(0);
  });
});
