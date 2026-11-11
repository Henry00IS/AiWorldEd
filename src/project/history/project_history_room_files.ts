import { PROJECT_AUTOSAVE_LOCKED_MARK } from '@/project/autosave/project_autosave_files.js';
import { PROJECT_EDITOR_SNAPSHOTS_DIRECTORY } from '@/project/fs/project_editor_folder.js';
import type {
  SnapshotCollaborationMeta,
  SnapshotCollaborationReason,
} from '@/collaboration/snapshot/store_collaboration_snapshot.js';

/** Longest room name written into a snapshot file. */
export const PROJECT_HISTORY_ROOM_NAME_MAX = 80;

/** Snapshot file extension (plain JSON). */
const PROJECT_HISTORY_ROOM_EXTENSION = 'json';

/** Reasons a room snapshot can be taken for. */
const PROJECT_HISTORY_ROOM_REASONS: readonly SnapshotCollaborationReason[] = [
  'room-start',
  'periodic',
  'large-change',
  'before-restore',
  'manual',
];

/**
 * Names a snapshot after its time, object count and reason
 * ("20261101-142233-123_3000_periodic"), so a list needs no file reads.
 *
 * @param savedAt Time in milliseconds.
 * @param count Object count.
 * @param reason Why it was taken.
 * @returns Snapshot id.
 */
export function projectHistoryRoomId(savedAt: number, count: number, reason: SnapshotCollaborationReason): string {
  const iso = new Date(savedAt).toISOString();
  const stamp = `${iso.slice(0, 10).replace(/-/g, '')}-${iso.slice(11, 19).replace(/:/g, '')}-${iso.slice(20, 23)}`;
  return `${stamp}_${count}_${reason}`;
}

/**
 * Reads the time, count and reason back from a snapshot id.
 *
 * @param id Snapshot id.
 * @returns Parts, or null for a foreign name.
 */
export function projectHistoryRoomIdParse(
  id: string,
): Pick<SnapshotCollaborationMeta, 'savedAt' | 'count' | 'reason'> | null {
  const match = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-(\d{3})_(\d{1,7})_([a-z-]+)$/.exec(id);
  if (match === null) return null;
  const reason = match[9] as SnapshotCollaborationReason;
  if (!PROJECT_HISTORY_ROOM_REASONS.includes(reason)) return null;
  const [year, month, day, hour, minute, second, milli, count] = match.slice(1, 9).map(Number) as number[];
  return { savedAt: Date.UTC(year!, month! - 1, day!, hour!, minute!, second!, milli!), count: count!, reason };
}

/**
 * Returns the path of a snapshot file.
 *
 * @param id Snapshot id.
 * @param locked Whether the snapshot is locked.
 * @returns Project-relative path.
 */
export function projectHistoryRoomPath(id: string, locked: boolean): string {
  return `${PROJECT_EDITOR_SNAPSHOTS_DIRECTORY}/${projectHistoryRoomFileName(id, locked)}`;
}

/**
 * Returns the file name of a snapshot ("<id>.json", "<id>.locked.json").
 *
 * @param id Snapshot id.
 * @param locked Whether the snapshot is locked.
 * @returns File name.
 */
export function projectHistoryRoomFileName(id: string, locked: boolean): string {
  const lock = locked ? `.${PROJECT_AUTOSAVE_LOCKED_MARK}` : '';
  return `${id}${lock}.${PROJECT_HISTORY_ROOM_EXTENSION}`;
}

/**
 * Reads the id, time, count, reason and lock back from a snapshot file name.
 *
 * @param name File name.
 * @returns Snapshot meta, or null for foreign files.
 */
export function projectHistoryRoomFileParse(name: string): SnapshotCollaborationMeta | null {
  const suffix = `.${PROJECT_HISTORY_ROOM_EXTENSION}`;
  if (!name.endsWith(suffix)) return null;
  const base = name.slice(0, -suffix.length);
  const lockSuffix = `.${PROJECT_AUTOSAVE_LOCKED_MARK}`;
  const locked = base.endsWith(lockSuffix);
  const id = locked ? base.slice(0, -lockSuffix.length) : base;
  const meta = projectHistoryRoomIdParse(id);
  return meta === null ? null : { id, ...meta, stored: 'project', locked };
}
