import { projectPathName, projectPathStem } from '@/project/fs/project_path.js';

/**
 * Kind of a save: an autosave (crash recovery, a few per level or room) or a
 * snapshot (kept for {@link PROJECT_HISTORY_SNAPSHOT_KEEP_MS}, or forever when
 * starred).
 */
export type ProjectHistoryEntryKind = 'autosave' | 'snapshot';

/** What a save holds: a level or a collaboration room. */
export type ProjectHistoryEntrySource = 'level' | 'room';

/** One save of the Level History. Its files sit in the folder of its day. */
export interface ProjectHistoryEntry {
  id: string;
  /** Local day of the save ("2026-11-11"), also its folder name. */
  day: string;
  kind: ProjectHistoryEntryKind;
  /** Starred saves are never deleted. */
  starred: boolean;
  /** Time of the save in milliseconds. */
  time: number;
  source: ProjectHistoryEntrySource;
  /** Level path in the project, or null. */
  path: string | null;
  /**
   * Title of the level's file at the time of the save, or null when it had
   * none.
   */
  title: string | null;
  /** Room name for a room save, else null. */
  room: string | null;
  /**
   * Everything in the save: scene objects and all brushes, groups, generators
   * and volumes.
   */
  objectCount: number;
  /** Whether a thumbnail was written. */
  thumbnail: boolean;
}

/** Autosaves kept per level and per room; older ones are replaced. */
export const PROJECT_HISTORY_AUTOSAVE_KEEP = 4;

/** How long a snapshot that is not starred is kept. */
export const PROJECT_HISTORY_SNAPSHOT_KEEP_MS = 14 * 86_400_000;

/** A change saved this long after the last snapshot becomes a snapshot. */
export const PROJECT_HISTORY_SNAPSHOT_EVERY_MS = 30 * 60_000;

/**
 * Tells which kind a save of a changed scene is: a snapshot once 30 minutes
 * passed since the last snapshot, else an autosave. Only changed scenes are
 * saved, so an idle editor makes no snapshots.
 *
 * @param now Save time.
 * @param lastSnapshot Time of the last snapshot.
 * @returns Kind of the save.
 */
export function projectHistorySaveKind(now: number, lastSnapshot: number): ProjectHistoryEntryKind {
  return now - lastSnapshot >= PROJECT_HISTORY_SNAPSHOT_EVERY_MS ? 'snapshot' : 'autosave';
}

/** Name shown for a save of a level that has no file. */
export const PROJECT_HISTORY_NAME_UNSAVED = 'Unsaved Level';

/** Name shown for a save of a collaboration room. */
export const PROJECT_HISTORY_NAME_ROOM = 'Collaborative Room';

/** Day folder names: a local date. */
export const PROJECT_HISTORY_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Save ids: a UTC time stamp plus an optional counter. */
export const PROJECT_HISTORY_ID_PATTERN = /^\d{8}-\d{6}-\d{3}(?:-\d{1,4})?$/;

/**
 * Returns the local day of a time ("2026-11-11").
 *
 * @param time Time in milliseconds.
 * @returns Day key.
 */
export function projectHistoryDay(time: number): string {
  const date = new Date(time);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Words a day as the locale writes a date with day, month and year.
 *
 * @param day Day key.
 * @param locale Locale; the browser's when omitted.
 * @returns Label such as "11.11.2026".
 */
export function projectHistoryDayLabel(day: string, locale?: string): string {
  const [year, month, date] = day.split('-').map(Number);
  const value = new Date(year ?? 1970, (month ?? 1) - 1, date ?? 1);
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(value);
}

/**
 * Returns the name a save shows: its level's file title, "Unsaved Level" or
 * "Collaborative Room".
 *
 * @param entry Save.
 * @returns Name.
 */
export function projectHistoryEntryName(entry: ProjectHistoryEntry): string {
  if (entry.source === 'room') return PROJECT_HISTORY_NAME_ROOM;
  return entry.title ?? PROJECT_HISTORY_NAME_UNSAVED;
}

/**
 * Turns a file name or project path into a level title ("maps/Keep.aiworld" →
 * "Keep").
 *
 * @param file File name or path, or null.
 * @returns Title, or null without a file.
 */
export function projectHistoryTitle(file: string | null): string | null {
  if (file === null || file === '') return null;
  return projectPathStem(projectPathName(file)) || null;
}

/**
 * Stars or unstars a save. A starred autosave becomes a snapshot and leaves the
 * autosave rotation; unstarring keeps it a snapshot.
 *
 * @param entry Save.
 * @param starred Whether to star it.
 * @returns Changed copy.
 */
export function projectHistoryStar(entry: ProjectHistoryEntry, starred: boolean): ProjectHistoryEntry {
  return { ...entry, starred, kind: starred ? 'snapshot' : entry.kind };
}

/**
 * Returns the saves the retention rules remove: autosaves beyond the newest
 * {@link PROJECT_HISTORY_AUTOSAVE_KEEP} of each level and room, and snapshots
 * older than {@link PROJECT_HISTORY_SNAPSHOT_KEEP_MS} that are not starred.
 * Starred saves always stay.
 *
 * @param entries Saves.
 * @param now Current time.
 * @returns Saves to remove.
 */
export function projectHistoryPrune(entries: readonly ProjectHistoryEntry[], now: number): ProjectHistoryEntry[] {
  const removed: ProjectHistoryEntry[] = [];
  const autosaves = new Map<string, ProjectHistoryEntry[]>();
  for (const entry of entries) {
    if (entry.starred) continue;
    if (entry.kind === 'snapshot') {
      if (now - entry.time > PROJECT_HISTORY_SNAPSHOT_KEEP_MS) removed.push(entry);
      continue;
    }
    const owner = projectHistoryOwner(entry);
    autosaves.set(owner, [...(autosaves.get(owner) ?? []), entry]);
  }
  for (const list of autosaves.values())
    removed.push(...list.sort((left, right) => right.time - left.time).slice(PROJECT_HISTORY_AUTOSAVE_KEEP));
  return removed;
}

/**
 * Returns what a save belongs to for the autosave rotation: its level path or
 * its room.
 *
 * @param entry Save.
 * @returns Owner key.
 */
export function projectHistoryOwner(entry: ProjectHistoryEntry): string {
  return entry.source === 'room' ? `room/${entry.room ?? ''}` : `level/${entry.path ?? ''}`;
}

/** The saves of one day. */
export interface ProjectHistoryDayGroup {
  day: string;
  /** Autosaves first, then newest first. */
  entries: ProjectHistoryEntry[];
}

/**
 * Groups saves by day, newest day first; in a day the autosaves come first,
 * each part newest first.
 *
 * @param entries Saves.
 * @returns Days.
 */
export function projectHistoryDays(entries: readonly ProjectHistoryEntry[]): ProjectHistoryDayGroup[] {
  const days = new Map<string, ProjectHistoryEntry[]>();
  for (const entry of entries) days.set(entry.day, [...(days.get(entry.day) ?? []), entry]);
  const order = (left: ProjectHistoryEntry, right: ProjectHistoryEntry) =>
    Number(right.kind === 'autosave') - Number(left.kind === 'autosave') || right.time - left.time;
  return [...days.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([day, list]) => ({ day, entries: list.sort(order) }));
}

/**
 * Names a save id after a time in UTC, adding a counter while the id is taken.
 *
 * @param entries Saves.
 * @param time Time in milliseconds.
 * @returns Unused id.
 */
export function projectHistoryIdCreate(entries: readonly ProjectHistoryEntry[], time: number): string {
  const iso = new Date(time).toISOString();
  const stamp = `${iso.slice(0, 10).replace(/-/g, '')}-${iso.slice(11, 19).replace(/:/g, '')}-${iso.slice(20, 23)}`;
  const used = new Set(entries.map((entry) => entry.id));
  let id = stamp;
  for (let counter = 2; used.has(id); counter += 1) id = `${stamp}-${counter}`;
  return id;
}

/**
 * Parses one save from the index; invalid ones read as null.
 *
 * @param value Untrusted value.
 * @returns Save, or null.
 */
export function projectHistoryEntryParse(value: unknown): ProjectHistoryEntry | null {
  if (typeof value !== 'object' || value === null) return null;
  const item = value as Record<string, unknown>;
  const { id, day, time, objectCount } = item;
  if (typeof id !== 'string' || !PROJECT_HISTORY_ID_PATTERN.test(id)) return null;
  if (typeof day !== 'string' || !PROJECT_HISTORY_DAY_PATTERN.test(day)) return null;
  if (typeof time !== 'number' || !Number.isFinite(time)) return null;
  const text = (field: unknown) => (typeof field === 'string' && field !== '' ? field : null);
  const source = item['source'] === 'room' ? 'room' : 'level';
  return {
    id,
    day,
    kind: item['kind'] === 'autosave' ? 'autosave' : 'snapshot',
    starred: item['starred'] === true,
    time,
    source,
    path: text(item['path']),
    title: text(item['title']),
    room: source === 'room' ? (text(item['room']) ?? '') : null,
    objectCount: typeof objectCount === 'number' && objectCount >= 0 ? Math.floor(objectCount) : 0,
    thumbnail: item['thumbnail'] === true,
  };
}
