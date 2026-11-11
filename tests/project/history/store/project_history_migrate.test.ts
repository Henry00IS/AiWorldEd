import { describe, expect, it } from 'vitest';
import {
  projectHistoryMigrateDistinct,
  projectHistoryMigrateField,
} from '@/project/history/store/project_history_migrate.js';
import {
  type ProjectHistoryMigrateFile,
  projectHistoryMigrateLevelParse,
  projectHistoryMigrateRoomParse,
} from '@/project/history/store/project_history_migrate_names.js';

/**
 * Builds an older level file entry.
 *
 * @param time File time.
 * @param latest Whether it is the latest autosave.
 * @returns File entry.
 */
function file(time: number, latest: boolean): ProjectHistoryMigrateFile {
  return { path: `f${time}`, kind: 'level', key: 'k', time, name: '', latest, objectCount: null };
}

describe('project history migration', () => {
  it('reads older autosave, copy and room snapshot names', () => {
    expect(projectHistoryMigrateLevelParse('a/x.autosave.json', 'x.autosave.json', null, 5)).toMatchObject([
      { key: 'x', time: 5, latest: true, name: '' },
    ]);
    expect(projectHistoryMigrateLevelParse('p', '20260102-030405.snapshot.json', 'k')).toMatchObject([
      { key: 'k', time: Date.UTC(2026, 0, 2, 3, 4, 5), name: 'Snapshot' },
    ]);
    expect(projectHistoryMigrateLevelParse('p', '20260102-030405.restore.locked.json', 'k')).toMatchObject([
      { name: 'Kept Autosave' },
    ]);
    expect(projectHistoryMigrateLevelParse('p', '20260102-030405.restore.json', 'k')).toMatchObject([{ name: '' }]);
    expect(projectHistoryMigrateLevelParse('p', 'notes.txt', 'k')).toEqual([]);
    expect(projectHistoryMigrateRoomParse('p', '20260102-030405-678_42_manual.json')).toMatchObject({
      kind: 'room',
      time: Date.UTC(2026, 0, 2, 3, 4, 5, 678),
      objectCount: 42,
      name: 'Room Snapshot',
    });
    expect(projectHistoryMigrateRoomParse('p', 'x.json')).toBeNull();
  });

  it('drops a latest autosave that duplicates a copy and sorts oldest first', () => {
    const kept = projectHistoryMigrateDistinct([file(9000, false), file(9500, true), file(1000, false)]);
    expect(kept.map((entry) => entry.time)).toEqual([1000, 9000]);
    expect(projectHistoryMigrateDistinct([file(1000, false), file(5000, true)]).map((entry) => entry.time)).toEqual([
      1000, 5000,
    ]);
  });

  it('reads the level path or room name from the start of a file, even when the rest is cut off', () => {
    const head = '{"format":"x","sourcePath":"maps/a \\"b\\".aiworld","room":"Team","objects":[{"na';
    expect(projectHistoryMigrateField(head, 'sourcePath')).toBe('maps/a "b".aiworld');
    expect(projectHistoryMigrateField(head, 'room')).toBe('Team');
    expect(projectHistoryMigrateField('{"room":"cut', 'room')).toBeNull();
    expect(projectHistoryMigrateField('', 'sourcePath')).toBeNull();
  });
});
