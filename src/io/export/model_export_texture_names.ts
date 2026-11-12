import type * as THREE from 'three';
import { textureEmbeddedFallbackName, textureEmbeddedIdIs } from '@/texture/embedded/texture_embedded_id.js';
import { getTextureMapCache } from '@/texture/library/texture_map_cache.js';

/** Longest file name stem an export writes. */
const MODEL_EXPORT_TEXTURE_NAME_MAXIMUM = 64;

/** Image extensions dropped from a readable name before the stem is built. */
const MODEL_EXPORT_TEXTURE_NAME_EXTENSION = /\.(png|jpe?g|gif|webp|bmp|tga|tiff?)$/i;

/** Names Windows refuses as file names, whatever the extension. */
const MODEL_EXPORT_TEXTURE_NAME_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * Gives each texture of one export a file name stem: its readable name (an
 * embedded texture's original name, a project texture's file name, else the
 * material's name), made safe for file systems. Two different textures with the
 * same name, compared without regard to case as on Windows and macOS, get "_2",
 * "_3" and so on in the order they are met; the same texture always gets the
 * same stem.
 */
export class ModelExportTextureNames {
  private readonly stems = new Map<string, string>();
  private readonly used = new Set<string>();

  /**
   * Creates the names of one export.
   *
   * @param fallback Stem used when a texture has no usable name.
   */
  constructor(private readonly fallback: string) {}

  /**
   * Returns the stem of a texture, allocating it on first use.
   *
   * @param texture Texture (its name is the texture id).
   * @param material Material using it, named when the texture is not.
   * @returns File name stem without extension.
   */
  stemOf(texture: THREE.Texture, material: THREE.Material): string {
    const key = modelExportTextureKey(texture);
    const known = this.stems.get(key);
    if (known !== undefined) return known;
    const base = modelExportTextureNameSanitize(modelExportTextureReadableName(texture, material)) || this.fallback;
    let stem = base;
    for (let suffix = 2; this.used.has(stem.toLowerCase()); suffix++) stem = `${base}_${suffix}`;
    this.used.add(stem.toLowerCase());
    this.stems.set(key, stem);
    return stem;
  }
}

/**
 * Identifies a texture within an export: its library id, so several texture
 * objects showing the same library texture are written once, else the object.
 *
 * @param texture Texture.
 * @returns Key.
 */
export function modelExportTextureKey(texture: THREE.Texture): string {
  const id = texture.name.trim();
  const listed = id !== '' && (textureEmbeddedIdIs(id) || getTextureMapCache().getLibrary()?.getEntryById(id));
  return listed ? `id:${id}` : `object:${texture.uuid}`;
}

/**
 * Returns the readable name of a texture.
 *
 * @param texture Texture (its name is the texture id).
 * @param material Material using it.
 * @returns Name, possibly with an extension or unsafe characters.
 */
function modelExportTextureReadableName(texture: THREE.Texture, material: THREE.Material): string {
  const id = texture.name.trim();
  if (textureEmbeddedIdIs(id))
    return getTextureMapCache().getLibrary()?.getEntryById(id)?.displayName ?? textureEmbeddedFallbackName(id);
  return id.replace(/^.*[\\/]/, '') || material.name;
}

/**
 * Makes a name safe as a file name stem: no folders, no image extension, only
 * letters, digits, ".", "_" and "-", no leading or trailing dots or
 * underscores, at most 64 characters, and never a name Windows reserves.
 *
 * @param name Readable name.
 * @returns Stem, or "" when nothing usable is left.
 */
export function modelExportTextureNameSanitize(name: string): string {
  const stem = name
    .trim()
    .replace(/^.*[\\/]/, '')
    .replace(MODEL_EXPORT_TEXTURE_NAME_EXTENSION, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .slice(0, MODEL_EXPORT_TEXTURE_NAME_MAXIMUM)
    .replace(/^[._]+|[._]+$/g, '');
  return MODEL_EXPORT_TEXTURE_NAME_RESERVED.test(stem) ? `${stem}_` : stem;
}
