/** Largest folder depth below the project root the editor follows. */
export const PROJECT_PATH_DEPTH_MAXIMUM = 16;

/**
 * Splits a project-relative path ("walls/brick.png", "" for the root) into its
 * segments, rejecting anything that could leave the project: empty segments,
 * ".", "..", backslashes, drive letters and NUL characters.
 *
 * @param path Project-relative path with forward slashes.
 * @returns Segments, empty for the root.
 * @throws Error when the path is not a safe relative path.
 */
export function projectPathSegments(path: string): string[] {
  if (path === '') return [];
  const segments = path.split('/');
  if (segments.length > PROJECT_PATH_DEPTH_MAXIMUM + 1 || !segments.every(projectPathSegmentSafe))
    throw new Error(`Unsafe project path: ${path}`);
  return segments;
}

/**
 * Tells whether one path segment is a plain file or folder name.
 *
 * @param segment Path segment.
 * @returns True when the segment is safe.
 */
export function projectPathSegmentSafe(segment: string): boolean {
  if (segment === '' || segment === '.' || segment === '..') return false;
  return !/[\\/:\u0000]/.test(segment);
}

/**
 * Joins a folder path and a name.
 *
 * @param directory Folder path ("" for the root).
 * @param name File or folder name.
 * @returns Joined path.
 */
export function projectPathJoin(directory: string, name: string): string {
  return directory === '' ? name : `${directory}/${name}`;
}

/**
 * Returns the folder part of a path.
 *
 * @param path Project-relative path.
 * @returns Parent folder path ("" for the root).
 */
export function projectPathParent(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash < 0 ? '' : path.slice(0, slash);
}

/**
 * Returns the last segment of a path.
 *
 * @param path Project-relative path.
 * @returns File or folder name.
 */
export function projectPathName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/**
 * Returns the lower-case extension of a file name, without the dot.
 *
 * @param name File name or path.
 * @returns Extension, or "" when there is none.
 */
export function projectPathExtension(name: string): string {
  const base = projectPathName(name);
  const dot = base.lastIndexOf('.');
  return dot <= 0 ? '' : base.slice(dot + 1).toLowerCase();
}

/**
 * Returns the file name without its extension.
 *
 * @param name File name or path.
 * @returns Base name.
 */
export function projectPathStem(name: string): string {
  const base = projectPathName(name);
  const dot = base.lastIndexOf('.');
  return dot <= 0 ? base : base.slice(0, dot);
}
