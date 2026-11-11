import { projectAutosaveHistoryParse } from '@/project/autosave/project_autosave_files.js';
import type { ProjectFileSystem, ProjectFileSystemEntry } from '@/project/fs/project_file_system.js';
import {
  PROJECT_EDITOR_AUTOSAVE_DIRECTORY,
  PROJECT_EDITOR_AUTOSAVE_HISTORY_DIRECTORY,
  PROJECT_EDITOR_SNAPSHOTS_DIRECTORY,
} from '@/project/fs/project_editor_folder.js';
import { projectPathJoin } from '@/project/fs/project_path.js';
import type { ProjectHistoryEntry } from './project_history_entry.js';
import { projectHistoryRoomFileParse } from './project_history_room_files.js';

/** File name ending of the latest autosave of a level. */
const PROJECT_HISTORY_LATEST_SUFFIX = '.autosave.json';

/**
 * Lists every restorable entry in a project folder, newest first: the latest
 * autosave of each level, the rotated autosave copies and snapshots, and the
 * room snapshot files. Reads only folder listings, no file contents.
 *
 * @param fileSystem Project folder.
 * @returns History entries.
 */
export async function projectHistoryList(fileSystem: ProjectFileSystem): Promise<ProjectHistoryEntry[]> {
  const [latest, copies, room] = await Promise.all([
    projectHistoryLatestList(fileSystem),
    projectHistoryCopyList(fileSystem),
    projectHistoryRoomList(fileSystem),
  ]);
  return [...latest, ...copies, ...room].sort((left, right) => right.time - left.time);
}

/**
 * Lists a folder with file sizes and times; a missing folder lists nothing.
 *
 * @param fileSystem Project folder.
 * @param path Folder path.
 * @returns Folder entries.
 */
async function projectHistoryFolderList(
  fileSystem: ProjectFileSystem,
  path: string,
): Promise<ProjectFileSystemEntry[]> {
  return fileSystem.directoryList(path, () => true).catch(() => []);
}

/**
 * Lists the latest autosave of each level.
 *
 * @param fileSystem Project folder.
 * @returns History entries.
 */
async function projectHistoryLatestList(fileSystem: ProjectFileSystem): Promise<ProjectHistoryEntry[]> {
  const entries = await projectHistoryFolderList(fileSystem, PROJECT_EDITOR_AUTOSAVE_DIRECTORY);
  return entries
    .filter((entry) => entry.kind === 'file' && entry.name.endsWith(PROJECT_HISTORY_LATEST_SUFFIX))
    .map((entry) => {
      const path = projectPathJoin(PROJECT_EDITOR_AUTOSAVE_DIRECTORY, entry.name);
      const level = entry.name.slice(0, -PROJECT_HISTORY_LATEST_SUFFIX.length);
      return projectHistoryEntryCreate(path, 'latest', level, entry.lastModified ?? 0, false, entry.size);
    });
}

/**
 * Lists the rotated autosave copies and snapshots of every level.
 *
 * @param fileSystem Project folder.
 * @returns History entries.
 */
async function projectHistoryCopyList(fileSystem: ProjectFileSystem): Promise<ProjectHistoryEntry[]> {
  const levels = await projectHistoryFolderList(fileSystem, PROJECT_EDITOR_AUTOSAVE_HISTORY_DIRECTORY);
  const lists = await Promise.all(
    levels
      .filter((level) => level.kind === 'directory')
      .map((level) => projectHistoryLevelCopyList(fileSystem, level.name)),
  );
  return lists.flat();
}

/**
 * Lists the rotated autosave copies and snapshots of one level.
 *
 * @param fileSystem Project folder.
 * @param level Level key.
 * @returns History entries.
 */
async function projectHistoryLevelCopyList(
  fileSystem: ProjectFileSystem,
  level: string,
): Promise<ProjectHistoryEntry[]> {
  const folder = projectPathJoin(PROJECT_EDITOR_AUTOSAVE_HISTORY_DIRECTORY, level);
  const entries = await projectHistoryFolderList(fileSystem, folder);
  return entries.flatMap((entry) => {
    const copy = entry.kind === 'file' ? projectAutosaveHistoryParse(entry.name) : null;
    if (copy === null) return [];
    const path = projectPathJoin(folder, entry.name);
    return [projectHistoryEntryCreate(path, copy.kind, level, copy.time, copy.locked, entry.size)];
  });
}

/**
 * Lists the room snapshot files.
 *
 * @param fileSystem Project folder.
 * @returns History entries.
 */
async function projectHistoryRoomList(fileSystem: ProjectFileSystem): Promise<ProjectHistoryEntry[]> {
  const entries = await projectHistoryFolderList(fileSystem, PROJECT_EDITOR_SNAPSHOTS_DIRECTORY);
  return entries.flatMap((entry) => {
    const meta = entry.kind === 'file' ? projectHistoryRoomFileParse(entry.name) : null;
    if (meta === null) return [];
    const path = projectPathJoin(PROJECT_EDITOR_SNAPSHOTS_DIRECTORY, entry.name);
    const created = projectHistoryEntryCreate(path, 'room', null, meta.savedAt, meta.locked, entry.size);
    return [{ ...created, objectCount: meta.count, reason: meta.reason, snapshotId: meta.id }];
  });
}

/**
 * Builds an autosave entry.
 *
 * @param path Project-relative path.
 * @param kind What it holds.
 * @param level Level key, or null for room snapshots.
 * @param time Time it was written.
 * @param locked Whether it is locked.
 * @param size File size, when known.
 * @returns History entry.
 */
function projectHistoryEntryCreate(
  path: string,
  kind: ProjectHistoryEntry['kind'],
  level: string | null,
  time: number,
  locked: boolean,
  size: number | undefined,
): ProjectHistoryEntry {
  const known = size ?? null;
  return { id: path, path, kind, level, time, locked, size: known, objectCount: null, reason: null, snapshotId: null };
}
