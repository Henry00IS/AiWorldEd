import { describe, expect, it } from 'vitest';
import { projectAutosaveHistoryName, projectAutosaveHistoryPrune } from '@/project/autosave/project_autosave_files.js';
import { SnapshotCollaborationFolderStore } from '@/collaboration/snapshot/store_collaboration_snapshot.js';
import { projectHistoryList } from '@/project/history/project_history_list.js';
import { projectHistoryLock, projectHistoryLockPath } from '@/project/history/project_history_lock.js';
import { projectAutosaveProjectCreate } from '../autosave/project_autosave_test_utils.js';
import {
  PROJECT_HISTORY_TIME,
  projectHistoryCopyWrite,
  projectHistoryLatestWrite,
  projectHistoryRoomWrite,
} from './project_history_files_fixture.js';

describe('projectHistoryLock', () => {
  it('renames an autosave copy to its locked name and back, keeping its contents', async () => {
    const { root, fileSystem } = projectAutosaveProjectCreate();
    const path = await projectHistoryCopyWrite(fileSystem, PROJECT_HISTORY_TIME);
    const [entry] = await projectHistoryList(fileSystem);
    const locked = await projectHistoryLock(fileSystem, entry!, true);
    expect(locked.path).toBe(path.replace('.json', '.locked.json'));
    expect(root.handleAt(path)).toBeUndefined();
    expect((await projectHistoryList(fileSystem))[0]).toMatchObject({ locked: true, path: locked.path });
    const unlocked = await projectHistoryLock(fileSystem, locked, false);
    expect(unlocked.path).toBe(path);
    expect(await (await fileSystem.fileRead(path)).text()).toContain('"objectCount":3');
  });

  it('locks room snapshot files so the room store never prunes them', async () => {
    const { fileSystem } = projectAutosaveProjectCreate();
    const id = await projectHistoryRoomWrite(fileSystem, PROJECT_HISTORY_TIME);
    const [entry] = await projectHistoryList(fileSystem);
    await projectHistoryLock(fileSystem, entry!, true);
    const store = new SnapshotCollaborationFolderStore(fileSystem);
    expect((await store.list()).find((meta) => meta.id === id)?.locked).toBe(true);
  });

  it('cannot lock the latest autosave, which is replaced as you work', async () => {
    const { fileSystem } = projectAutosaveProjectCreate();
    const path = await projectHistoryLatestWrite(fileSystem, PROJECT_HISTORY_TIME);
    const [entry] = await projectHistoryList(fileSystem);
    expect(projectHistoryLockPath(entry!, true)).toBeNull();
    expect((await projectHistoryLock(fileSystem, entry!, true)).path).toBe(path);
  });

  it('keeps a locked copy out of the autosave prune, however old', async () => {
    const { fileSystem } = projectAutosaveProjectCreate();
    await projectHistoryCopyWrite(fileSystem, PROJECT_HISTORY_TIME - 30 * 86_400_000);
    const [entry] = await projectHistoryList(fileSystem);
    const locked = await projectHistoryLock(fileSystem, entry!, true);
    const lockedName = locked.path?.split('/').pop() ?? '';
    const unlockedName = entry?.path?.split('/').pop() ?? '';
    const fresh = Array.from({ length: 12 }, (_, index) =>
      projectAutosaveHistoryName(PROJECT_HISTORY_TIME - index * 60_000),
    );
    expect(projectAutosaveHistoryPrune([unlockedName, ...fresh], PROJECT_HISTORY_TIME)).toContain(unlockedName);
    expect(projectAutosaveHistoryPrune([lockedName, ...fresh], PROJECT_HISTORY_TIME)).not.toContain(lockedName);
  });
});
