import { describe, expect, it } from 'vitest';
import type { NodeCollaborationState } from '@/collaboration/scene/node_collaboration_types.js';
import {
  SNAPSHOT_COLLABORATION_DIRECTORY,
  SNAPSHOT_COLLABORATION_FOLDER_KEEP,
  SNAPSHOT_COLLABORATION_FORMAT,
  SNAPSHOT_COLLABORATION_MEMORY_KEEP,
  SnapshotCollaborationFolderStore,
  SnapshotCollaborationMemoryStore,
  snapshotCollaborationId,
  snapshotCollaborationIdParse,
  snapshotCollaborationParse,
  type SnapshotCollaborationScene,
} from '@/collaboration/snapshot/store_collaboration_snapshot.js';
import { textureEmbeddedAdd } from '@/texture/embedded/texture_embedded_library.js';
import { TextureLibrary } from '@/texture/library/texture_library.js';
import { sha256HexSync } from '@/utils/utils_sha256.js';
import { pngHeaderCreate } from '../session/texture_collaboration_fixture.js';
import { projectAutosaveProjectCreate } from '../../project/autosave/project_autosave_test_utils.js';

const STATE: NodeCollaborationState = { id: 'n1', kind: 'entry', parent: '', key: 'a', data: { entry: {} } as never };

/**
 * Builds a snapshot.
 *
 * @param savedAt Time in milliseconds.
 * @returns Snapshot.
 */
function sceneAt(savedAt: number): SnapshotCollaborationScene {
  const id = snapshotCollaborationId(savedAt, 1, 'periodic');
  return { id, savedAt, count: 1, reason: 'periodic', stored: 'memory', states: [STATE] };
}

describe('snapshot ids', () => {
  it('round-trips time, count and reason', () => {
    const id = snapshotCollaborationId(Date.UTC(2026, 10, 1, 14, 22, 33, 123), 3000, 'large-change');
    expect(id).toBe('20261101-142233-123_3000_large-change');
    expect(snapshotCollaborationIdParse(id)).toEqual({
      savedAt: Date.UTC(2026, 10, 1, 14, 22, 33, 123),
      count: 3000,
      reason: 'large-change',
    });
  });

  it('rejects foreign names and paths', () => {
    expect(snapshotCollaborationIdParse('../x')).toBeNull();
    expect(snapshotCollaborationIdParse('20261101-142233-123_1_unknown')).toBeNull();
  });

  it('drops invalid states and rejects other files', () => {
    const id = snapshotCollaborationId(0, 2, 'manual');
    const text = JSON.stringify({ format: 'aiworlded-room-snapshot', states: [STATE, { id: '../bad' }] });
    expect(snapshotCollaborationParse(id, text)?.states).toEqual([STATE]);
    expect(snapshotCollaborationParse(id, '{"format":"other","states":[]}')).toBeNull();
    expect(snapshotCollaborationParse(id, 'not json')).toBeNull();
  });
});

describe('SnapshotCollaborationMemoryStore', () => {
  it('keeps the newest snapshots', async () => {
    const store = new SnapshotCollaborationMemoryStore();
    for (let index = 0; index < SNAPSHOT_COLLABORATION_MEMORY_KEEP + 3; index += 1)
      await store.save(sceneAt(index * 1000));
    const list = await store.list();
    expect(list).toHaveLength(SNAPSHOT_COLLABORATION_MEMORY_KEEP);
    expect(list[0]?.savedAt).toBe((SNAPSHOT_COLLABORATION_MEMORY_KEEP + 2) * 1000);
    expect((await store.load(list[0]!.id))?.states).toEqual([STATE]);
  });
});

describe('SnapshotCollaborationFolderStore', () => {
  it('writes, lists, loads and prunes snapshot files', async () => {
    const { fileSystem } = projectAutosaveProjectCreate();
    const store = new SnapshotCollaborationFolderStore(fileSystem);
    for (let index = 0; index < SNAPSHOT_COLLABORATION_FOLDER_KEEP + 2; index += 1)
      await store.save(sceneAt(index * 1000));
    const list = await store.list();
    expect(list).toHaveLength(SNAPSHOT_COLLABORATION_FOLDER_KEEP);
    expect(list.every((meta) => meta.stored === 'project')).toBe(true);
    const files = await fileSystem.directoryList(SNAPSHOT_COLLABORATION_DIRECTORY, () => false);
    expect(files).toHaveLength(SNAPSHOT_COLLABORATION_FOLDER_KEEP);
    expect((await store.load(list[0]!.id))?.states).toEqual([STATE]);
    expect(await store.load('missing')).toBeNull();
  });

  it('writes .json files and ignores files with another extension', async () => {
    const { fileSystem } = projectAutosaveProjectCreate();
    const store = new SnapshotCollaborationFolderStore(fileSystem);
    const other = sceneAt(500);
    const text = JSON.stringify({ format: SNAPSHOT_COLLABORATION_FORMAT, version: 1, states: other.states });
    await store.save(sceneAt(0));
    const [written] = await fileSystem.directoryList(SNAPSHOT_COLLABORATION_DIRECTORY, () => false);
    expect(written?.name).toBe(`${sceneAt(0).id}.json`);
    await fileSystem.fileWrite(`${SNAPSHOT_COLLABORATION_DIRECTORY}/${other.id}.aiworld`, text);
    expect((await store.list()).map((meta) => meta.id)).toEqual([sceneAt(0).id]);
    expect(await store.load(other.id)).toBeNull();
  });

  it('lists nothing without a snapshot folder', async () => {
    const { fileSystem } = projectAutosaveProjectCreate();
    expect(await new SnapshotCollaborationFolderStore(fileSystem).list()).toEqual([]);
  });

  it('keeps the embedded textures of a snapshot in the texture cache and lists them again on load', async () => {
    const { root, fileSystem } = projectAutosaveProjectCreate();
    const png = pngHeaderCreate(8, 8);
    const id = `embedded:${sha256HexSync(png)}.png`;
    const library = new TextureLibrary();
    textureEmbeddedAdd(library, [{ id, name: 'crate', blob: new Blob([new Uint8Array(png)], { type: 'image/png' }) }]);
    const scene = { ...sceneAt(0), states: [{ ...STATE, data: { entry: { textureId: id } } as never }] };
    await new SnapshotCollaborationFolderStore(fileSystem, () => library).save(scene);
    expect(root.handleAt(`AiWorldEd/.Local/TextureCache/${sha256HexSync(png)}.png`)).toBeDefined();
    const fresh = new TextureLibrary();
    await new SnapshotCollaborationFolderStore(fileSystem, () => fresh).load(scene.id);
    expect(fresh.getEntryById(id)?.displayName).toBe('crate');
  });
});
