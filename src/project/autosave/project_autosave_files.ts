import type { SceneJSON } from '@/io/scene/io_types.js';
import { projectPathStem } from '@/project/fs/project_path.js';
import {
  PROJECT_EDITOR_AUTOSAVE_DIRECTORY,
  PROJECT_EDITOR_AUTOSAVE_HISTORY_DIRECTORY,
} from '@/project/fs/project_editor_folder.js';

/** Folder that holds the latest autosave of each scene. */
export const PROJECT_AUTOSAVE_DIRECTORY = PROJECT_EDITOR_AUTOSAVE_DIRECTORY;

/** Folder that holds the rotated autosave copies. */
export const PROJECT_AUTOSAVE_HISTORY_DIRECTORY = PROJECT_EDITOR_AUTOSAVE_HISTORY_DIRECTORY;

/** File extension of autosaves and their rotated copies (plain JSON). */
export const PROJECT_AUTOSAVE_EXTENSION = 'json';

/** File name suffix of the latest autosave. */
export const PROJECT_AUTOSAVE_SUFFIX = `.autosave.${PROJECT_AUTOSAVE_EXTENSION}`;

/** Scene key used while the scene was not opened from the project. */
export const PROJECT_AUTOSAVE_UNTITLED = 'untitled';

/** Newest rotated copies always kept. */
export const PROJECT_AUTOSAVE_HISTORY_RECENT = 10;

/** Hours for which the newest copy of each hour is kept. */
export const PROJECT_AUTOSAVE_HISTORY_HOURS = 48;

/** Format marker written into every autosave file. */
export const PROJECT_AUTOSAVE_FORMAT = 'aiworlded-autosave';

/** Contents of an autosave file. */
export interface ProjectAutosaveDocument {
  format: typeof PROJECT_AUTOSAVE_FORMAT;
  version: 1;
  scene: string;
  sourcePath: string | null;
  savedAt: number;
  objectCount: number;
  data: SceneJSON;
}

/**
 * Turns the scene's project path into a flat, safe file name stem
 * ("maps/start.aiworld" and "maps/start.json" become "maps__start").
 *
 * @param sourcePath Scene path in the project, or null when untitled.
 * @returns Scene key.
 */
export function projectAutosaveKey(sourcePath: string | null): string {
  if (sourcePath === null) return PROJECT_AUTOSAVE_UNTITLED;
  const parts = sourcePath.split('/');
  parts[parts.length - 1] = projectPathStem(parts[parts.length - 1] ?? '');
  const key = parts
    .join('__')
    .replace(/[^A-Za-z0-9._ -]+/g, '_')
    .replace(/^\.+/, '_');
  return key.slice(0, 120) || PROJECT_AUTOSAVE_UNTITLED;
}

/**
 * Returns the path of a scene's latest autosave.
 *
 * @param key Scene key.
 * @returns Project-relative path.
 */
export function projectAutosavePath(key: string): string {
  return `${PROJECT_AUTOSAVE_DIRECTORY}/${key}${PROJECT_AUTOSAVE_SUFFIX}`;
}

/**
 * Tells whether a file name in the autosave folder is a latest autosave.
 *
 * @param name File name.
 * @returns True for names ending in the autosave suffix.
 */
export function projectAutosaveNameIs(name: string): boolean {
  return name.endsWith(PROJECT_AUTOSAVE_SUFFIX);
}

/**
 * Returns the folder of a scene's rotated copies.
 *
 * @param key Scene key.
 * @returns Project-relative folder path.
 */
export function projectAutosaveHistoryFolder(key: string): string {
  return `${PROJECT_AUTOSAVE_HISTORY_DIRECTORY}/${key}`;
}

/**
 * What a rotated copy holds: an autosave, a snapshot taken by hand, or the
 * level kept before a restore.
 */
export type ProjectAutosaveCopyKind = 'autosave' | 'snapshot' | 'restore';

/** What a rotated copy's file name tells. */
export interface ProjectAutosaveCopyName {
  time: number;
  kind: ProjectAutosaveCopyKind;
  /** Locked copies are never deleted by any cleanup. */
  locked: boolean;
}

/** File name mark of a locked copy or room snapshot ("….locked.json"). */
export const PROJECT_AUTOSAVE_LOCKED_MARK = 'locked';

/** File name marks of the copy kinds other than plain autosaves. */
const PROJECT_AUTOSAVE_COPY_MARKS: Readonly<Record<Exclude<ProjectAutosaveCopyKind, 'autosave'>, string>> = {
  snapshot: 'snapshot',
  restore: 'restore',
};

/**
 * Names a rotated copy after its time in UTC, its kind and whether it is locked
 * ("20261101-142233.json", "20261101-142233.snapshot.locked.json").
 *
 * @param time Time in milliseconds.
 * @param kind What the copy holds.
 * @param locked Whether the copy is locked.
 * @returns File name.
 */
export function projectAutosaveHistoryName(
  time: number,
  kind: ProjectAutosaveCopyKind = 'autosave',
  locked = false,
): string {
  const iso = new Date(time).toISOString();
  const stamp = `${iso.slice(0, 10).replace(/-/g, '')}-${iso.slice(11, 19).replace(/:/g, '')}`;
  const mark = kind === 'autosave' ? '' : `.${PROJECT_AUTOSAVE_COPY_MARKS[kind]}`;
  const lock = locked ? `.${PROJECT_AUTOSAVE_LOCKED_MARK}` : '';
  return `${stamp}${mark}${lock}.${PROJECT_AUTOSAVE_EXTENSION}`;
}

/**
 * Reads the time, kind and lock back from a rotated copy name.
 *
 * @param name File name.
 * @returns Parts, or null for foreign files.
 */
export function projectAutosaveHistoryParse(name: string): ProjectAutosaveCopyName | null {
  const match = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})(?:\.(snapshot|restore))?(\.locked)?\.([a-z]+)$/.exec(
    name,
  );
  if (match === null || match[9] !== PROJECT_AUTOSAVE_EXTENSION) return null;
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number) as number[];
  const time = Date.UTC(year!, month! - 1, day!, hour!, minute!, second!);
  return {
    time,
    kind: (match[7] as ProjectAutosaveCopyKind | undefined) ?? 'autosave',
    locked: match[8] !== undefined,
  };
}

/**
 * Picks the rotated copies to delete. Locked copies always stay. Of the plain
 * autosaves, the newest ten and the newest of each of the last 48 hours stay;
 * snapshots taken by hand and levels kept before a restore stay for 48 hours.
 *
 * @param names Rotated copy file names.
 * @param now Current time in milliseconds.
 * @returns Names to delete.
 */
export function projectAutosaveHistoryPrune(names: readonly string[], now: number): string[] {
  const unlocked = names
    .map((name) => ({ name, copy: projectAutosaveHistoryParse(name) }))
    .filter((entry): entry is { name: string; copy: ProjectAutosaveCopyName } => entry.copy?.locked === false)
    .sort((left, right) => right.copy.time - left.copy.time);
  const automatic = unlocked.filter((entry) => entry.copy.kind === 'autosave');
  const byHand = unlocked.filter((entry) => entry.copy.kind !== 'autosave');
  const expired = byHand.filter((entry) => now - entry.copy.time > PROJECT_AUTOSAVE_HISTORY_HOURS * 3_600_000);
  return [...projectAutosaveHistoryThin(automatic, now), ...expired.map((entry) => entry.name)];
}

/**
 * Picks the plain autosaves to delete: all but the newest ten and the newest of
 * each of the last 48 hours.
 *
 * @param dated Plain autosaves, newest first.
 * @param now Current time in milliseconds.
 * @returns Names to delete.
 */
function projectAutosaveHistoryThin(
  dated: readonly { name: string; copy: ProjectAutosaveCopyName }[],
  now: number,
): string[] {
  const keep = new Set(dated.slice(0, PROJECT_AUTOSAVE_HISTORY_RECENT).map((entry) => entry.name));
  const hours = new Set<number>();
  dated.forEach((entry) => {
    const hour = Math.floor(entry.copy.time / 3_600_000);
    if (now - entry.copy.time > PROJECT_AUTOSAVE_HISTORY_HOURS * 3_600_000 || hours.has(hour)) return;
    hours.add(hour);
    keep.add(entry.name);
  });
  return dated.filter((entry) => !keep.has(entry.name)).map((entry) => entry.name);
}

/**
 * Parses and checks an autosave file.
 *
 * @param text File contents.
 * @returns Document, or null when the file is not a valid autosave.
 */
export function projectAutosaveParse(text: string): ProjectAutosaveDocument | null {
  try {
    const value = JSON.parse(text) as Partial<ProjectAutosaveDocument> | null;
    if (!value || value.format !== PROJECT_AUTOSAVE_FORMAT || typeof value.savedAt !== 'number') return null;
    const data = value.data as Partial<SceneJSON> | undefined;
    if (!data || typeof data.version !== 'number' || !Array.isArray(data.objects)) return null;
    return value as ProjectAutosaveDocument;
  } catch {
    return null;
  }
}
