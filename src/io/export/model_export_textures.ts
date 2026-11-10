import type * as THREE from 'three';
import { modelExportTexturePng } from './model_export_texture_png.js';
import { textureFileNameWithExtension, textureOriginalFile } from '@/texture/library/texture_original_file.js';
import { modelExportPathJoin } from './model_export_options.js';

/**
 * Where an export puts its textures: inside the model file, or copied into a
 * folder relative to the model ('' for the model's own folder).
 */
export type ModelExportTextures = { mode: 'embedded' } | { mode: 'copy'; folder: string };

/** Where one texture of an export ends up. */
export type ModelExportTexturePlacement =
  /** Written into the model file. */
  | { kind: 'embedded'; fileName: string; blob: Blob }
  /** Written as a file at a path relative to the model. */
  | { kind: 'file'; path: string; blob: Blob };

/**
 * Decides where one texture goes and reads its image: the original file's bytes
 * when the texture came from one (so a re-import stores the same hash once),
 * else a PNG of the pixels.
 *
 * @param texture Texture (its name is the texture id).
 * @param fileName Suggested file name; the extension follows the image format.
 * @param textures Export texture mode.
 * @param formats Image formats (extensions) the model format allows, or null
 *   for any; other images are written as PNG.
 * @returns Placement, or null when the image cannot be read.
 */
export async function modelExportTexturePlace(
  texture: THREE.Texture,
  fileName: string,
  textures: ModelExportTextures,
  formats: readonly string[] | null = null,
): Promise<ModelExportTexturePlacement | null> {
  const allowed = (extension: string) => formats === null || formats.includes(extension.toLowerCase());
  const found = await textureOriginalFile(texture);
  const original = found !== null && allowed(found.extension) ? found : null;
  const blob = original?.blob ?? (await modelExportTexturePng(texture));
  if (!blob) return null;
  const name = original ? textureFileNameWithExtension(fileName, original.extension) : fileName;
  if (textures.mode === 'embedded') return { kind: 'embedded', fileName: name, blob };
  return { kind: 'file', path: modelExportPathJoin(textures.folder, name), blob };
}
