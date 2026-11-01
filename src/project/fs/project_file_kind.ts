import { projectPathExtension } from './project_path.js';

/** Kinds of files the project panel lists. */
export type ProjectFileKind = 'texture' | 'scene' | 'vmf' | 'obj';

/** Extensions per kind; other files are not listed. */
const PROJECT_FILE_KIND_EXTENSIONS: ReadonlyMap<string, ProjectFileKind> = new Map([
  ['png', 'texture'],
  ['jpg', 'texture'],
  ['jpeg', 'texture'],
  ['gif', 'texture'],
  ['webp', 'texture'],
  ['bmp', 'texture'],
  ['json', 'scene'],
  ['vmf', 'vmf'],
  ['obj', 'obj'],
]);

/** MIME type per texture extension. */
const PROJECT_FILE_TEXTURE_MIME: ReadonlyMap<string, string> = new Map([
  ['png', 'image/png'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['gif', 'image/gif'],
  ['webp', 'image/webp'],
  ['bmp', 'image/bmp'],
]);

/**
 * Classifies a file by its extension.
 *
 * @param name File name or path.
 * @returns Kind, or null when the editor cannot use the file.
 */
export function projectFileKindOf(name: string): ProjectFileKind | null {
  return PROJECT_FILE_KIND_EXTENSIONS.get(projectPathExtension(name)) ?? null;
}

/**
 * Returns the image MIME type of a texture file name.
 *
 * @param name File name or path.
 * @returns MIME type, or "application/octet-stream" for other files.
 */
export function projectFileTextureMime(name: string): string {
  return PROJECT_FILE_TEXTURE_MIME.get(projectPathExtension(name)) ?? 'application/octet-stream';
}
