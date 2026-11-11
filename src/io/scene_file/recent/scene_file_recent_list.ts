import type { SceneFileHandle } from '@/io/scene_file/scene_file_session.js';

/** Most files the Recent list keeps. */
export const SCENE_FILE_RECENT_LIMIT = 10;

/** One file in the Recent list. */
export interface SceneFileRecentEntry {
  handle: SceneFileHandle;
  /** Time the file was last opened or saved, in milliseconds. */
  usedAt: number;
}

/**
 * Puts a file at the top of the Recent list: an entry for the same file moves
 * up, and the oldest entries beyond {@link SCENE_FILE_RECENT_LIMIT} drop off.
 *
 * @param entries Current list, newest first.
 * @param handle File that was opened or saved.
 * @param usedAt Time of use in milliseconds.
 * @returns New list, newest first.
 */
export async function sceneFileRecentListAdd(
  entries: readonly SceneFileRecentEntry[],
  handle: SceneFileHandle,
  usedAt: number,
): Promise<SceneFileRecentEntry[]> {
  const others: SceneFileRecentEntry[] = [];
  for (const entry of entries) {
    if (!(await sceneFileRecentSame(entry.handle, handle))) others.push(entry);
  }
  return [{ handle, usedAt }, ...others].slice(0, SCENE_FILE_RECENT_LIMIT);
}

/**
 * Checks stored data and keeps only well-formed file entries, newest first.
 *
 * @param value Value read from storage.
 * @returns Valid entries, at most {@link SCENE_FILE_RECENT_LIMIT}.
 */
export function sceneFileRecentListParse(value: unknown): SceneFileRecentEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item: unknown): item is SceneFileRecentEntry => sceneFileRecentEntryIs(item))
    .sort((left, right) => right.usedAt - left.usedAt)
    .slice(0, SCENE_FILE_RECENT_LIMIT);
}

/**
 * Tells whether two handles point at the same file.
 *
 * @param left First handle.
 * @param right Second handle.
 * @returns True for the same file; false when the browser cannot tell.
 */
async function sceneFileRecentSame(left: SceneFileHandle, right: SceneFileHandle): Promise<boolean> {
  if (left === right) return true;
  if (left.isSameEntry === undefined) return false;
  return left.isSameEntry(right).catch(() => false);
}

/**
 * Tells whether a stored item is a Recent entry with a file handle.
 *
 * @param item Stored item.
 * @returns True for a valid entry.
 */
function sceneFileRecentEntryIs(item: unknown): item is SceneFileRecentEntry {
  const entry = item as Partial<SceneFileRecentEntry> | null;
  if (typeof entry !== 'object' || entry === null || typeof entry.usedAt !== 'number') return false;
  const handle = entry.handle as { kind?: unknown; name?: unknown; getFile?: unknown } | undefined;
  return handle?.kind === 'file' && typeof handle.name === 'string' && typeof handle.getFile === 'function';
}
