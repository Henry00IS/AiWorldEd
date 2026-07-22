/**
 * One texture listed in the texture browser grid.
 */
export interface TextureBrowserEntry {
  /** Stable unique id for selection (usually relative path). */
  id: string;
  /** Short label shown under the thumbnail. */
  displayName: string;
  /** Original file name including extension. */
  fileName: string;
  /** Path relative to the opened folder root. */
  relativePath: string;
  /** Object URL used for the preview image (must be revoked on dispose). */
  previewObjectUrl: string;
  /** MIME type from the File, when available. */
  mimeType: string;
  /** File size in bytes. */
  byteSize: number;
  /** Source File object for later Three.js texture loading. */
  sourceFile: File;
}

/**
 * Creates a browser entry from a File and relative path.
 * @param file Browser File from the folder scan.
 * @param relativePath Path relative to the opened root folder.
 * @returns Texture browser entry with a live object URL.
 */
export function createTextureBrowserEntry(
  file: File,
  relativePath: string
): TextureBrowserEntry {
  const previewObjectUrl = URL.createObjectURL(file);
  return {
    id: relativePath,
    displayName: stripExtension(file.name),
    fileName: file.name,
    relativePath,
    previewObjectUrl,
    mimeType: file.type || 'application/octet-stream',
    byteSize: file.size,
    sourceFile: file
  };
}

/**
 * Releases the object URL held by an entry.
 * @param entry Entry whose preview URL should be revoked.
 */
export function revokeTextureBrowserEntry(entry: TextureBrowserEntry): void {
  URL.revokeObjectURL(entry.previewObjectUrl);
}

/**
 * Strips the last extension from a file name.
 * @param fileName File name.
 * @returns Stem without extension.
 */
function stripExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex <= 0) return fileName;
  return fileName.slice(0, dotIndex);
}
