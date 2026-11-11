import { ZipReader, zipReaderSignatureIs } from '@/io/zip/zip_reader.js';

/** Zip entry holding the level thumbnail. */
export const SCENE_FILE_THUMBNAIL_ENTRY = 'thumbnail.webp';

/** Largest thumbnail a level file may hold, in bytes. */
export const SCENE_FILE_THUMBNAIL_SIZE_LIMIT = 256 * 1024;

/**
 * Returns whether the first bytes of a file look like a WebP image.
 *
 * @param head First bytes (at least twelve).
 * @returns True for a RIFF WebP header.
 */
export function sceneFileThumbnailHeaderIs(head: Uint8Array): boolean {
  if (head.length < 12) return false;
  const tag = (offset: number, text: string) =>
    text.split('').every((character, index) => head[offset + index] === character.charCodeAt(0));
  return tag(0, 'RIFF') && tag(8, 'WEBP');
}

/**
 * Returns the thumbnail when it is a WebP image within the entry cap, or null.
 *
 * @param thumbnail Candidate image, or null or undefined.
 * @returns The thumbnail, or null when it is missing, too large, or not WebP.
 */
export async function sceneFileThumbnailAccept(thumbnail: Blob | null | undefined): Promise<Blob | null> {
  if (thumbnail == null || thumbnail.size === 0 || thumbnail.size > SCENE_FILE_THUMBNAIL_SIZE_LIMIT) return null;
  const head = new Uint8Array(await thumbnail.slice(0, 12).arrayBuffer());
  return sceneFileThumbnailHeaderIs(head) ? thumbnail : null;
}

/**
 * Reads the thumbnail of a level file without unpacking the level or its
 * textures. A stored entry is returned as a slice of the file. Legacy JSON
 * levels and files without a valid thumbnail return null.
 *
 * @param file Level file.
 * @returns WebP image, or null.
 */
export async function sceneFileThumbnailRead(file: Blob): Promise<Blob | null> {
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (!zipReaderSignatureIs(head)) return null;
  return sceneFileThumbnailEntryRead(await ZipReader.open(file));
}

/**
 * Reads and checks the thumbnail entry of an already opened level zip.
 *
 * @param zip Level zip.
 * @returns WebP image, or null when the entry is missing or invalid.
 */
export async function sceneFileThumbnailEntryRead(zip: ZipReader): Promise<Blob | null> {
  const entry = zip.entry(SCENE_FILE_THUMBNAIL_ENTRY);
  if (entry === null) return null;
  try {
    return await sceneFileThumbnailAccept(await zip.read(entry));
  } catch {
    return null;
  }
}
