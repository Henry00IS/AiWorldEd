import { describe, expect, it } from 'vitest';
import { ProjectHistoryDetailsReader, projectHistoryDetailsParse } from '@/project/history/project_history_details.js';
import { projectHistoryList } from '@/project/history/project_history_list.js';
import { projectAutosaveProjectCreate } from '../autosave/project_autosave_test_utils.js';
import {
  PROJECT_HISTORY_TIME,
  projectHistoryCopyWrite,
  projectHistoryRoomWrite,
} from './project_history_files_fixture.js';

describe('projectHistoryDetails', () => {
  it('reads object count, scene path and room from the start of a file', () => {
    const head = '{"format":"x","sourcePath":"maps/\\"start\\".aiworld","savedAt":1,"objectCount":42,"data":{';
    expect(projectHistoryDetailsParse(head)).toEqual({
      objectCount: 42,
      sourcePath: 'maps/"start".aiworld',
      room: null,
    });
    expect(projectHistoryDetailsParse(`{"room":"${'r'.repeat(200)}"`).room).toHaveLength(80);
    expect(projectHistoryDetailsParse('{"room":"\\u0000bad","sourcePath":null}')).toMatchObject({ sourcePath: null });
    expect(projectHistoryDetailsParse('garbage')).toEqual({ objectCount: null, sourcePath: null, room: null });
  });

  it('reads each file once and the room of room snapshots', async () => {
    const { fileSystem } = projectAutosaveProjectCreate();
    await projectHistoryCopyWrite(fileSystem, PROJECT_HISTORY_TIME);
    await projectHistoryRoomWrite(fileSystem, PROJECT_HISTORY_TIME - 1000);
    const [copy, room] = await projectHistoryList(fileSystem);
    const reader = new ProjectHistoryDetailsReader();
    expect((await reader.read(fileSystem, copy!)).objectCount).toBe(3);
    expect((await reader.read(fileSystem, room!)).room).toBe('Castle Jam');
    expect(reader.read(fileSystem, copy!)).toBe(reader.read(fileSystem, copy!));
  });
});
