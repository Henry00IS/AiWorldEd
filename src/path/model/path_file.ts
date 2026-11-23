import { pathAssetFromData, type PathAsset } from './path_asset.js';

/** File extension of path files, without the dot. */
export const PATH_FILE_EXTENSION = 'aipath';

/** Format tag written into every path file. */
export const PATH_FILE_FORMAT = 'aiworlded-path';

/** Path file version this editor writes and reads. */
export const PATH_FILE_VERSION = 1;

/** Largest path file the editor reads, in bytes. */
export const PATH_FILE_MAX_BYTES = 512 * 1024;

/** A path read from a file, or why it could not be read. */
export type PathFileReadResult = { path: PathAsset; name: string } | { error: string };

/**
 * Writes a path file.
 *
 * @param path Path.
 * @param name Display name.
 * @returns File text.
 */
export function pathFileWrite(path: PathAsset, name: string): string {
  return `${JSON.stringify({ format: PATH_FILE_FORMAT, version: PATH_FILE_VERSION, name, path }, null, 2)}\n`;
}

/**
 * Reads a path file.
 *
 * @param text File text.
 * @returns Path and name, or an error message.
 */
export function pathFileRead(text: string): PathFileReadResult {
  if (text.length > PATH_FILE_MAX_BYTES) return { error: 'The path file is too large.' };
  let data: Record<string, unknown>;
  try {
    data = (JSON.parse(text) ?? {}) as Record<string, unknown>;
  } catch {
    return { error: 'The path file is not valid JSON.' };
  }
  if (data['format'] !== PATH_FILE_FORMAT) return { error: 'This is not a path file.' };
  if (typeof data['version'] !== 'number' || data['version'] > PATH_FILE_VERSION)
    return { error: 'This path file was written by a newer version of the editor.' };
  const path = pathAssetFromData(data['path']);
  if (!path) return { error: 'The path file holds no path with two points or more.' };
  return { path, name: typeof data['name'] === 'string' ? data['name'] : '' };
}

/**
 * Returns the file name a path is saved under.
 *
 * @param name Display name; empty gives Path.
 * @returns File name with the extension.
 */
export function pathFileNameOf(name: string): string {
  const safe = name.trim().replace(/[\\/:*?"<>|]+/g, '_') || 'Path';
  return `${safe}.${PATH_FILE_EXTENSION}`;
}

/**
 * Returns whether a file name is a path file.
 *
 * @param name File name or project path.
 * @returns True for a .aipath file.
 */
export function pathFileNameReadable(name: string): boolean {
  return name.toLowerCase().endsWith(`.${PATH_FILE_EXTENSION}`);
}
