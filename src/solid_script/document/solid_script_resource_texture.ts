import { textureEmbeddedAdd } from '@/texture/embedded/texture_embedded_library.js';
import { textureEmbeddedIdOf } from '@/texture/embedded/texture_embedded_id.js';
import { textureImageExtension } from '@/texture/library/texture_image_sniff.js';
import { getTextureMapCache } from '@/texture/library/texture_map_cache.js';

/**
 * Keeps a copy of an image for a script: lists it in the texture library under
 * the id of its bytes, so it shows and saves with the script and the level.
 *
 * @param blob Image bytes.
 * @param name Readable name.
 * @returns Id of the copy, or null when the bytes are no known image.
 */
export async function solidScriptResourceTextureEmbed(blob: Blob, name: string): Promise<string | null> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (textureImageExtension(bytes) === null) return null;
  const id = await textureEmbeddedIdOf(bytes, blob.type);
  const library = getTextureMapCache().getLibrary();
  if (library) textureEmbeddedAdd(library, [{ id, name, blob: new Blob([bytes], { type: blob.type }) }]);
  return id;
}

/**
 * Gives the image bytes of a kept texture.
 *
 * @param id Texture id.
 * @returns Bytes, or null when the library lacks them.
 */
export function solidScriptResourceTextureBlob(id: string): Blob | null {
  return getTextureMapCache().getLibrary()?.getEntryById(id)?.sourceFile ?? null;
}

/**
 * Gives the preview image of a kept texture.
 *
 * @param id Texture id.
 * @returns Image URL, or null.
 */
export function solidScriptResourceTexturePreview(id: string): string | null {
  return getTextureMapCache().getLibrary()?.getEntryById(id)?.previewObjectUrl || null;
}
