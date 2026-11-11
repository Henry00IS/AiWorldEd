import { projectAutosaveKeyClean } from '@/project/autosave/project_autosave_files.js';

/** Key of a room tree whose room had no name. */
export const PROJECT_HISTORY_ROOM_UNNAMED = 'Room';

/**
 * Returns the label a level tree shows.
 *
 * @param sourcePath Level path in the project, or null when untitled.
 * @returns Label.
 */
export function projectHistoryLevelLabel(sourcePath: string | null): string {
  return sourcePath ?? 'Untitled Level';
}

/**
 * Turns a level key back into a readable label ("maps/start").
 *
 * @param key Level key.
 * @returns Label.
 */
export function projectHistoryLevelKeyLabel(key: string): string {
  return key === 'untitled' ? projectHistoryLevelLabel(null) : key.replace(/__/g, '/');
}

/**
 * Returns the key of a room tree.
 *
 * @param roomName Room name.
 * @returns Folder name.
 */
export function projectHistoryRoomKey(roomName: string): string {
  return projectAutosaveKeyClean(roomName) || PROJECT_HISTORY_ROOM_UNNAMED;
}
