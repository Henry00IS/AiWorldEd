import { getImageManager } from '@/texture/image_manager/image_manager_shared.js';
import type { ImageManagerSource } from '@/texture/image_manager/image_manager_types.js';

/** One texture listed in the texture browser grid. */
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
  /**
   * SHA-256 of the file's bytes when known (project files, from the hash cache
   * in AiWorldEd/.Local): a store id with this hash shows this file.
   */
  sha256?: string;
}

/**
 * Creates a browser entry from a File and relative path.
 *
 * And registers its image with the image manager (keyed by the object URL).
 *
 * @param file Browser File from the folder scan.
 * @param relativePath Path relative to the opened root folder.
 * @param origin Where it comes from, shown in the Debug Menu (folder, project,
 *   embedded, collaboration).
 * @returns Texture browser entry with a live object URL.
 */
export function createTextureBrowserEntry(file: File, relativePath: string, origin = 'folder'): TextureBrowserEntry {
  const previewObjectUrl = URL.createObjectURL(file);
  const entry: TextureBrowserEntry = {
    id: relativePath,
    displayName: stripExtension(file.name),
    fileName: file.name,
    relativePath,
    previewObjectUrl,
    mimeType: file.type || 'application/octet-stream',
    byteSize: file.size,
    sourceFile: file,
  };
  getImageManager().sourceSet(textureBrowserEntryImageSource(entry, origin));
  return entry;
}

/**
 * Describes an entry's image for the image manager.
 *
 * @param entry Entry.
 * @param origin Where it comes from.
 * @returns Image source (name, file and hash follow the entry).
 */
export function textureBrowserEntryImageSource(entry: TextureBrowserEntry, origin: string): ImageManagerSource {
  return {
    name: entry.fileName,
    origin,
    blob: entry.sourceFile,
    url: entry.previewObjectUrl,
    hash: () => entry.sha256,
  };
}

/**
 * Releases the object URL held by an entry; the image manager lets go of its
 * image once nothing uses it any more.
 *
 * @param entry Entry whose preview URL should be revoked.
 */
export function revokeTextureBrowserEntry(entry: TextureBrowserEntry): void {
  getImageManager().sourceRemove(entry.previewObjectUrl);
  URL.revokeObjectURL(entry.previewObjectUrl);
}

/**
 * Strips the last extension from a file name.
 *
 * @param fileName File name.
 * @returns Stem without extension.
 */
function stripExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex <= 0) return fileName;
  return fileName.slice(0, dotIndex);
}
