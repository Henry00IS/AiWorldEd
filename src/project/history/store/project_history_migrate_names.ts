import type { ProjectHistoryTreeKind } from '@/project/history/tree/project_history_tree.js';

/** An older autosave, autosave copy or room snapshot file. */
export interface ProjectHistoryMigrateFile {
  path: string;
  kind: ProjectHistoryTreeKind;
  /** Tree key: the level key, or the room key once read. */
  key: string;
  time: number;
  /** Name the node gets: empty for plain autosaves. */
  name: string;
  /** Whether it is the latest autosave of a level. */
  latest: boolean;
  /** Object count from the file name, when it has one. */
  objectCount: number | null;
}

/** Suffix of the latest autosave of a level. */
const PROJECT_HISTORY_MIGRATE_LATEST_SUFFIX = '.autosave.json';

/** Name of a rotated copy: time, kind and lock. */
const PROJECT_HISTORY_MIGRATE_COPY_NAME =
  /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})(?:\.(snapshot|restore))?(\.locked)?\.json$/;

/** Name of a room snapshot: time, count, reason and lock. */
const PROJECT_HISTORY_MIGRATE_ROOM_NAME =
  /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-(\d{3})_(\d{1,7})_([a-z-]+)(\.locked)?\.json$/;

/**
 * Reads an older level file name: a latest autosave ("<level>.autosave.json")
 * when no level is given, else a rotated copy of that level.
 *
 * @param path File path.
 * @param name File name.
 * @param level Level key of a copy, or null for the autosave folder.
 * @param lastModified File time of a latest autosave.
 * @returns The file in a list, or an empty list for foreign files.
 */
export function projectHistoryMigrateLevelParse(
  path: string,
  name: string,
  level: string | null,
  lastModified?: number,
): ProjectHistoryMigrateFile[] {
  if (level === null) {
    if (!name.endsWith(PROJECT_HISTORY_MIGRATE_LATEST_SUFFIX) || lastModified === undefined) return [];
    const key = name.slice(0, -PROJECT_HISTORY_MIGRATE_LATEST_SUFFIX.length);
    return [{ path, kind: 'level', key, time: lastModified, name: '', latest: true, objectCount: null }];
  }
  const match = PROJECT_HISTORY_MIGRATE_COPY_NAME.exec(name);
  if (match === null) return [];
  const time = projectHistoryMigrateTime(match.slice(1, 7), '0');
  const named = match[7] === 'snapshot' ? 'Snapshot' : match[8] !== undefined ? 'Kept Autosave' : '';
  return [{ path, kind: 'level', key: level, time, name: named, latest: false, objectCount: null }];
}

/**
 * Reads an older room snapshot file name; the room key is filled in later.
 *
 * @param path File path.
 * @param name File name.
 * @returns The file, or null for foreign files.
 */
export function projectHistoryMigrateRoomParse(path: string, name: string): ProjectHistoryMigrateFile | null {
  const match = PROJECT_HISTORY_MIGRATE_ROOM_NAME.exec(name);
  if (match === null) return null;
  const time = projectHistoryMigrateTime(match.slice(1, 7), match[7] ?? '0');
  const named = match[9] === 'manual' ? 'Room Snapshot' : match[10] !== undefined ? 'Kept Room Snapshot' : '';
  return { path, kind: 'room', key: '', time, name: named, latest: false, objectCount: Number(match[8] ?? 0) };
}

/**
 * Turns UTC date and time parts into milliseconds.
 *
 * @param parts Year, month, day, hour, minute and second as text.
 * @param milli Milliseconds as text.
 * @returns Time in milliseconds.
 */
function projectHistoryMigrateTime(parts: readonly (string | undefined)[], milli: string): number {
  const [year, month, day, hour, minute, second] = parts.map((part) => Number(part ?? 0));
  return Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1, hour ?? 0, minute ?? 0, second ?? 0, Number(milli));
}
