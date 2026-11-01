import { describe, expect, it } from 'vitest';
import type { NodeCollaborationState } from '@/collaboration/scene/node_collaboration_types.js';
import {
  SNAPSHOT_COLLABORATION_DIRECTORY,
  SNAPSHOT_COLLABORATION_FOLDER_KEEP,
  SNAPSHOT_COLLABORATION_MEMORY_KEEP,
  SnapshotCollaborationFolderStore,
  SnapshotCollaborationMemoryStore,
  snapshotCollaborationId,
  snapshotCollaborationIdParse,
  snapshotCollaborationParse,
  type SnapshotCollaborationScene,
} from '@/collaboration/snapshot/store_collaboration_snapshot.js';
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

  it('lists nothing without a snapshot folder', async () => {
    const { fileSystem } = projectAutosaveProjectCreate();
    expect(await new SnapshotCollaborationFolderStore(fileSystem).list()).toEqual([]);
  });
});
