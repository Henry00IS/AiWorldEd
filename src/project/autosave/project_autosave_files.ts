import type { SceneJSON } from '@/io/scene/io_types.js';
import { projectPathStem } from '@/project/fs/project_path.js';

/** Folder inside the project that holds editor state. */
export const PROJECT_AUTOSAVE_STATE_DIRECTORY = '.aiworlded';

/** Folder that holds the latest autosave of each scene. */
export const PROJECT_AUTOSAVE_DIRECTORY = `${PROJECT_AUTOSAVE_STATE_DIRECTORY}/autosave`;

/** Folder that holds the rotated autosave copies. */
export const PROJECT_AUTOSAVE_HISTORY_DIRECTORY = `${PROJECT_AUTOSAVE_DIRECTORY}/history`;

/** File name suffix of the latest autosave. */
export const PROJECT_AUTOSAVE_SUFFIX = '.autosave.json';

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
 * ("maps/start.json" becomes "maps__start").
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
 * Returns the folder of a scene's rotated copies.
 *
 * @param key Scene key.
 * @returns Project-relative folder path.
 */
export function projectAutosaveHistoryFolder(key: string): string {
  return `${PROJECT_AUTOSAVE_HISTORY_DIRECTORY}/${key}`;
}

/**
 * Names a rotated copy after its time in UTC ("20261101-142233.json").
 *
 * @param time Time in milliseconds.
 * @returns File name.
 */
export function projectAutosaveHistoryName(time: number): string {
  const iso = new Date(time).toISOString();
  return `${iso.slice(0, 10).replace(/-/g, '')}-${iso.slice(11, 19).replace(/:/g, '')}.json`;
}

/**
 * Reads the time back from a rotated copy name.
 *
 * @param name File name.
 * @returns Time in milliseconds, or null for foreign files.
 */
export function projectAutosaveHistoryTime(name: string): number | null {
  const match = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.json$/.exec(name);
  if (match === null) return null;
  const [, year, month, day, hour, minute, second] = match.map(Number) as number[];
  return Date.UTC(year!, month! - 1, day!, hour!, minute!, second!);
}

/**
 * Picks the rotated copies to delete: everything except the newest ten and the
 * newest copy of each of the last 48 hours.
 *
 * @param names Rotated copy file names.
 * @param now Current time in milliseconds.
 * @returns Names to delete.
 */
export function projectAutosaveHistoryPrune(names: readonly string[], now: number): string[] {
  const dated = names
    .map((name) => ({ name, time: projectAutosaveHistoryTime(name) }))
    .filter((entry): entry is { name: string; time: number } => entry.time !== null)
    .sort((left, right) => right.time - left.time);
  const keep = new Set(dated.slice(0, PROJECT_AUTOSAVE_HISTORY_RECENT).map((entry) => entry.name));
  const hours = new Set<number>();
  dated.forEach((entry) => {
    const hour = Math.floor(entry.time / 3_600_000);
    if (now - entry.time > PROJECT_AUTOSAVE_HISTORY_HOURS * 3_600_000 || hours.has(hour)) return;
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
