import { textureImageExtension } from '@/texture/library/texture_image_sniff.js';
import { sha256Hex } from '@/utils/utils_sha256.js';

/** Prefix of embedded texture ids; a colon never appears in a project path. */
export const TEXTURE_EMBEDDED_ID_PREFIX = 'embedded:';

/** Image MIME type per embedded texture extension. */
const TEXTURE_EMBEDDED_MIME: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
};

/** Embedded texture id: full SHA-256 of the bytes plus the image extension. */
const TEXTURE_EMBEDDED_ID = /^embedded:([0-9a-f]{64})\.(png|jpg|jpeg|gif|webp|bmp)$/;

/** Hash and extension of an embedded texture id. */
export interface TextureEmbeddedIdParts {
  hash: string;
  extension: string;
}

/**
 * Builds the id of an embedded texture ("embedded:<sha256>.<ext>").
 *
 * @param hash SHA-256 hex of the image bytes.
 * @param extension Image extension.
 * @returns Texture id.
 */
export function textureEmbeddedId(hash: string, extension: string): string {
  return `${TEXTURE_EMBEDDED_ID_PREFIX}${hash}.${extension}`;
}

/**
 * Builds the id of image bytes that are not a project file.
 *
 * @param bytes Image bytes.
 * @param mimeType Claimed MIME type (used when the bytes are not a known
 *   format).
 * @returns Texture id.
 */
export async function textureEmbeddedIdOf(bytes: Uint8Array, mimeType: string): Promise<string> {
  return textureEmbeddedId(await sha256Hex(bytes), textureEmbeddedExtensionOf(bytes, mimeType));
}

/**
 * Splits an embedded texture id into hash and extension.
 *
 * @param id Texture id.
 * @returns Parts, or null for any other id.
 */
export function textureEmbeddedIdParse(id: string): TextureEmbeddedIdParts | null {
  const match = TEXTURE_EMBEDDED_ID.exec(id);
  return match === null ? null : { hash: match[1]!, extension: match[2]! };
}

/**
 * Tells whether a texture id names an embedded texture.
 *
 * @param id Texture id.
 * @returns True for "embedded:<sha256>.<ext>".
 */
export function textureEmbeddedIdIs(id: string): boolean {
  return textureEmbeddedIdParse(id) !== null;
}

/**
 * Returns the extension of image bytes, read from their magic bytes; the
 * claimed MIME type only decides when the bytes are not a known format.
 *
 * @param bytes Image bytes.
 * @param mimeType Claimed MIME type.
 * @returns Extension ("png" when neither is known).
 */
export function textureEmbeddedExtensionOf(bytes: Uint8Array, mimeType: string): string {
  const sniffed = textureImageExtension(bytes);
  if (sniffed !== null && TEXTURE_EMBEDDED_MIME[sniffed] !== undefined) return sniffed;
  return Object.keys(TEXTURE_EMBEDDED_MIME).find((extension) => TEXTURE_EMBEDDED_MIME[extension] === mimeType) ?? 'png';
}

/**
 * Returns the MIME type of an embedded texture.
 *
 * @param id Texture id.
 * @returns MIME type.
 */
export function textureEmbeddedMime(id: string): string {
  return TEXTURE_EMBEDDED_MIME[textureEmbeddedIdParse(id)?.extension ?? ''] ?? 'application/octet-stream';
}

/**
 * Builds a label for an embedded texture without a known name.
 *
 * @param id Texture id.
 * @returns Short hash label, or the id itself for other ids.
 */
export function textureEmbeddedFallbackName(id: string): string {
  const parts = textureEmbeddedIdParse(id);
  return parts === null ? id : `Texture ${parts.hash.slice(0, 8)}`;
}
