import { projectHistoryRoomPath } from './project_history_room_files.js';
import { projectAutosaveHistoryFolder, projectAutosaveHistoryName } from '@/project/autosave/project_autosave_files.js';
import type { ProjectFileSystem } from '@/project/fs/project_file_system.js';
import { projectFileMove } from '@/project/fs/project_file_move.js';
import { projectPathJoin } from '@/project/fs/project_path.js';
import { projectHistoryLockable, type ProjectHistoryEntry } from './project_history_entry.js';

/**
 * Returns where an entry's file lives once locked or unlocked.
 *
 * @param entry History entry.
 * @param locked Wanted lock state.
 * @returns Project-relative path, or null when the entry cannot be locked.
 */
export function projectHistoryLockPath(entry: ProjectHistoryEntry, locked: boolean): string | null {
  if (!projectHistoryLockable(entry)) return null;
  if (entry.kind === 'room') return entry.snapshotId === null ? null : projectHistoryRoomPath(entry.snapshotId, locked);
  if (entry.kind === 'latest' || entry.level === null) return null;
  const name = projectAutosaveHistoryName(entry.time, entry.kind, locked);
  return projectPathJoin(projectAutosaveHistoryFolder(entry.level), name);
}

/**
 * Locks or unlocks an entry by renaming its file; locked files are skipped by
 * every cleanup and still count as texture cache users.
 *
 * @param fileSystem Project folder.
 * @param entry History entry.
 * @param locked Wanted lock state.
 * @returns The entry as it is now.
 */
export async function projectHistoryLock(
  fileSystem: ProjectFileSystem,
  entry: ProjectHistoryEntry,
  locked: boolean,
): Promise<ProjectHistoryEntry> {
  const path = projectHistoryLockPath(entry, locked);
  if (path === null || entry.path === null || entry.locked === locked) return entry;
  await projectFileMove(fileSystem, entry.path, path);
  return { ...entry, id: path, path, locked };
}
