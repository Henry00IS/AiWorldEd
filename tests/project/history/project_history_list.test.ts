import { describe, expect, it } from 'vitest';
import { projectHistoryList } from '@/project/history/project_history_list.js';
import { projectAutosaveProjectCreate } from '../autosave/project_autosave_test_utils.js';
import {
  PROJECT_HISTORY_TIME,
  projectHistoryCopyWrite,
  projectHistoryLatestWrite,
  projectHistoryRoomWrite,
} from './project_history_files_fixture.js';

describe('projectHistoryList', () => {
  it('lists latest autosaves, copies of every level and room snapshots, newest first', async () => {
    const { root, fileSystem } = projectAutosaveProjectCreate();
    const latest = await projectHistoryLatestWrite(fileSystem, PROJECT_HISTORY_TIME);
    (root.handleAt(latest) as { lastModified: number }).lastModified = PROJECT_HISTORY_TIME;
    await projectHistoryCopyWrite(fileSystem, PROJECT_HISTORY_TIME - 60_000);
    await projectHistoryCopyWrite(fileSystem, PROJECT_HISTORY_TIME - 120_000, 'snapshot', true, 'castle');
    const id = await projectHistoryRoomWrite(fileSystem, PROJECT_HISTORY_TIME - 180_000, true);
    const entries = await projectHistoryList(fileSystem);
    expect(entries.map((entry) => [entry.kind, entry.level, entry.locked])).toEqual([
      ['latest', 'maps__start', false],
      ['autosave', 'maps__start', false],
      ['snapshot', 'castle', true],
      ['room', null, true],
    ]);
    expect(entries[0]?.size).toBeGreaterThan(0);
    expect(entries[3]).toMatchObject({ snapshotId: id, objectCount: 7, reason: 'periodic' });
  });

  it('ignores foreign files and lists nothing in an empty project', async () => {
    const { fileSystem } = projectAutosaveProjectCreate();
    expect(await projectHistoryList(fileSystem)).toEqual([]);
    await fileSystem.fileWrite('AiWorldEd/.Local/Autosave/History/maps__start/notes.txt', 'x');
    await fileSystem.fileWrite('AiWorldEd/.Local/Snapshots/readme.json', '{}');
    await fileSystem.fileWrite('AiWorldEd/.Local/Autosave/other.json', '{}');
    expect(await projectHistoryList(fileSystem)).toEqual([]);
  });
});
