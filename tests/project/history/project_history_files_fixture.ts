import {
  PROJECT_AUTOSAVE_FORMAT,
  projectAutosaveHistoryFolder,
  projectAutosaveHistoryName,
  projectAutosavePath,
  type ProjectAutosaveCopyKind,
} from '@/project/autosave/project_autosave_files.js';
import type { ProjectFileSystem } from '@/project/fs/project_file_system.js';
import { projectHistoryRoomId, projectHistoryRoomPath } from '@/project/history/project_history_room_files.js';

/** Fixed time the fixtures use. */
export const PROJECT_HISTORY_TIME = Date.UTC(2026, 10, 10, 9);

/**
 * Builds an autosave file body.
 *
 * @param savedAt Save time.
 * @param objectCount Object count.
 * @returns File text.
 */
export function projectHistoryAutosaveText(savedAt: number, objectCount: number): string {
  const data = { version: 1, objects: [] };
  const sourcePath = 'maps/start.aiworld';
  return JSON.stringify({
    format: PROJECT_AUTOSAVE_FORMAT,
    version: 1,
    scene: 'maps__start',
    sourcePath,
    savedAt,
    objectCount,
    data,
  });
}

/**
 * Writes the latest autosave of maps/start.
 *
 * @param fileSystem Project folder.
 * @param time Save time.
 * @returns Path.
 */
export async function projectHistoryLatestWrite(fileSystem: ProjectFileSystem, time: number): Promise<string> {
  const path = projectAutosavePath('maps__start');
  await fileSystem.fileWrite(path, projectHistoryAutosaveText(time, 4));
  return path;
}

/**
 * Writes a rotated copy of a level.
 *
 * @param fileSystem Project folder.
 * @param time Copy time.
 * @param kind Copy kind.
 * @param locked Whether it is locked.
 * @param level Level key.
 * @returns Path.
 */
export async function projectHistoryCopyWrite(
  fileSystem: ProjectFileSystem,
  time: number,
  kind: ProjectAutosaveCopyKind = 'autosave',
  locked = false,
  level = 'maps__start',
): Promise<string> {
  const path = `${projectAutosaveHistoryFolder(level)}/${projectAutosaveHistoryName(time, kind, locked)}`;
  await fileSystem.fileWrite(path, projectHistoryAutosaveText(time, 3));
  return path;
}

/**
 * Writes a room snapshot file.
 *
 * @param fileSystem Project folder.
 * @param time Snapshot time.
 * @param locked Whether it is locked.
 * @returns Snapshot id.
 */
export async function projectHistoryRoomWrite(
  fileSystem: ProjectFileSystem,
  time: number,
  locked = false,
): Promise<string> {
  const id = projectHistoryRoomId(time, 7, 'periodic');
  const text = JSON.stringify({ format: 'aiworlded-room-snapshot', version: 1, room: 'Castle Jam', states: [] });
  await fileSystem.fileWrite(projectHistoryRoomPath(id, locked), text);
  return id;
}
