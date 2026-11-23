import { pathAssetFromData, type PathAsset } from './path_asset.js';

/**
 * A Path input that follows a Path object in the scene, found by name. It keeps
 * a shape of its own to fall back on while no Path object has the name.
 */
export interface PathReference {
  /** Name of the Path object followed. */
  readonly scene: string;
  /** Shape used while no Path object has the name. */
  readonly fallback: PathAsset | null;
}

/**
 * Writes a reference as the text a Path input stores: the shape to fall back on
 * with the scene name beside it, so readers that know no references still read
 * the shape.
 *
 * @param scene Name of the Path object.
 * @param fallback Shape used while no Path object has the name.
 * @returns Text.
 */
export function pathReferenceEncode(scene: string, fallback: PathAsset): string {
  return JSON.stringify({ scene, ...fallback });
}

/**
 * Reads the reference a Path input stores.
 *
 * @param text Stored text.
 * @returns Reference, or null for an own path or text that names no Path
 *   object.
 */
export function pathReferenceRead(text: string): PathReference | null {
  try {
    const data = JSON.parse(text) as { scene?: unknown } | null;
    const scene = typeof data?.scene === 'string' ? data.scene.trim() : '';
    return scene ? { scene, fallback: pathAssetFromData(data) } : null;
  } catch {
    return null;
  }
}
