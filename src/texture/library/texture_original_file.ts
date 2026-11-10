import type * as THREE from 'three';
import { getTextureMapCache } from './texture_map_cache.js';
import { textureImageExtension } from './texture_image_sniff.js';

/** A texture's image file exactly as it was loaded. */
export interface TextureOriginalFile {
  /** The file's bytes, unchanged. */
  blob: Blob;
  /** Extension from the magic bytes ("png", "jpg", …). */
  extension: string;
}

/**
 * Returns the image file a library texture was loaded from, so exporters can
 * write the original bytes instead of re-encoding the pixels: the same image
 * then hashes the same after a round trip and is embedded once.
 *
 * @param texture Texture (its name is the texture id).
 * @param lookup Finds a texture's source file; defaults to the texture library.
 * @returns Original file, or null when unknown or not a known image format.
 */
export async function textureOriginalFile(
  texture: THREE.Texture,
  lookup: (id: string) => Blob | null = (id) => getTextureMapCache().getLibrary()?.getEntryById(id)?.sourceFile ?? null,
): Promise<TextureOriginalFile | null> {
  if (!texture.name) return null;
  const blob = lookup(texture.name);
  if (blob === null) return null;
  try {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const extension = textureImageExtension(bytes);
    return extension === null ? null : { blob: new Blob([bytes], { type: blob.type }), extension };
  } catch {
    return null;
  }
}

/**
 * Replaces the extension of a file name.
 *
 * @param fileName File name.
 * @param extension New extension without the dot.
 * @returns File name.
 */
export function textureFileNameWithExtension(fileName: string, extension: string): string {
  const dot = fileName.lastIndexOf('.');
  return `${dot > 0 ? fileName.slice(0, dot) : fileName}.${extension}`;
}
