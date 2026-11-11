import type { SnapshotCollaborationReason } from '@/collaboration/snapshot/store_collaboration_snapshot.js';

/**
 * What a Level History entry holds: the latest autosave of a level, a rotated
 * autosave copy, a snapshot taken by hand, the level kept before a restore, or
 * a room snapshot.
 */
export type ProjectHistoryKind = 'latest' | 'autosave' | 'snapshot' | 'restore' | 'room';

/** One restorable entry of the Level History. */
export interface ProjectHistoryEntry {
  /**
   * Unique id: the project-relative path, or "memory:<id>" for a room snapshot
   * kept only in memory.
   */
  id: string;
  /**
   * Project-relative file path, or null for a room snapshot kept only in
   * memory.
   */
  path: string | null;
  kind: ProjectHistoryKind;
  /** Level key of autosave entries ("maps__start"), or null for room snapshots. */
  level: string | null;
  /** Time the entry was written, in milliseconds. */
  time: number;
  /** Locked entries are never deleted by any cleanup. */
  locked: boolean;
  /** File size in bytes, when known. */
  size: number | null;
  /** Object count, when known without reading the file. */
  objectCount: number | null;
  /** Why a room snapshot was taken. */
  reason: SnapshotCollaborationReason | null;
  /** Room snapshot id. */
  snapshotId: string | null;
}

/** Labels of the room snapshot reasons. */
const PROJECT_HISTORY_REASON_LABELS: Readonly<Record<SnapshotCollaborationReason, string>> = {
  'room-start': 'Room Start',
  periodic: 'Room Autosave',
  'large-change': 'Before Large Change',
  'before-restore': 'Before Restore',
  manual: 'Room Snapshot',
};

/** Labels of the autosave entry kinds. */
const PROJECT_HISTORY_KIND_LABELS: Readonly<Record<Exclude<ProjectHistoryKind, 'room'>, string>> = {
  latest: 'Latest Autosave',
  autosave: 'Autosave',
  snapshot: 'Snapshot',
  restore: 'Before Restore',
};

/**
 * Names what an entry holds ("Autosave", "Snapshot", "Before Large Change").
 *
 * @param entry History entry.
 * @returns Title Case label.
 */
export function projectHistoryKindLabel(entry: ProjectHistoryEntry): string {
  if (entry.kind !== 'room') return PROJECT_HISTORY_KIND_LABELS[entry.kind];
  return entry.reason === null ? 'Room Snapshot' : PROJECT_HISTORY_REASON_LABELS[entry.reason];
}

/**
 * Turns a level key back into a readable level name ("maps/start").
 *
 * @param level Level key, or null for room snapshots.
 * @returns Level name.
 */
export function projectHistoryLevelLabel(level: string | null): string {
  if (level === null) return 'Room Snapshots';
  return level === 'untitled' ? 'Untitled Level' : level.replace(/__/g, '/');
}

/**
 * Returns whether an entry can be locked: rotated copies and room snapshot
 * files can, the constantly replaced latest autosave and memory-only room
 * snapshots cannot.
 *
 * @param entry History entry.
 * @returns True when lockable.
 */
export function projectHistoryLockable(entry: ProjectHistoryEntry): boolean {
  return entry.kind !== 'latest' && entry.path !== null;
}
