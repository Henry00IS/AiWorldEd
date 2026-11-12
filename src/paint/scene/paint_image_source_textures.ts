import type * as THREE from 'three';
import { getTextureMapCache } from '@/texture/library/texture_map_cache.js';
import { getDebugCheckerTexture } from '@/texture/library/factory_debug_texture.js';
import { isDefaultCheckerTextureId } from '@/texture/library/texture_id.js';
import type { PaintImage, PaintImageSource } from '@/paint/raster/paint_image.js';

/** Longest side images are reduced to before painting with them. */
const PAINT_IMAGE_MAXIMUM_SIDE = 512;

/** Cached pixels of one texture. */
interface PaintImageEntry {
  readonly source: unknown;
  readonly image: PaintImage | null;
}

/**
 * Reads stencil and stamp images from the editor's texture maps. Pixels are
 * read once per loaded image and reduced to a bounded size; textures that are
 * still loading (showing the checker placeholder) report null, and
 * {@link version} changes when they arrive so the baker tries again at once.
 */
export class PaintImageSourceTextures implements PaintImageSource {
  private readonly entries = new Map<string, PaintImageEntry>();
  /** Textures that were not available, with the image they had then. */
  private readonly waiting = new Map<string, unknown>();
  private versionValue = 0;

  /** Changes whenever a texture that was not available becomes available. */
  get version(): number {
    return this.versionValue;
  }

  /** Bumps the version when a texture that was not available got a new image. */
  prepare(): void {
    if (this.waiting.size === 0) return;
    const cache = getTextureMapCache();
    let arrived = false;
    for (const [textureId, before] of this.waiting) {
      const texture = cache.resolve(textureId);
      if (!paintTextureReady(cache.isPlaceholder(textureId), textureId, texture)) continue;
      if ((texture as THREE.Texture).image === before) continue;
      this.waiting.delete(textureId);
      arrived = true;
    }
    if (arrived) this.versionValue++;
  }

  /**
   * Returns the pixels of a texture.
   *
   * @param textureId Texture id.
   * @returns Image, or null while it is not available.
   */
  image(textureId: string): PaintImage | null {
    const cache = getTextureMapCache();
    const texture = cache.resolve(textureId);
    const source: unknown = (texture as THREE.Texture).image;
    if (!paintTextureReady(cache.isPlaceholder(textureId), textureId, texture)) {
      this.waiting.set(textureId, undefined);
      return null;
    }
    const cached = this.entries.get(textureId);
    if (cached !== undefined && cached.source === source) return cached.image;
    const image = paintImageRead(source);
    if (image !== null) {
      this.entries.set(textureId, { source, image });
      this.waiting.delete(textureId);
    } else this.waiting.set(textureId, source);
    return image;
  }

  /** Forgets every cached image. */
  clear(): void {
    this.entries.clear();
  }
}

/**
 * Returns whether a texture shows its own image rather than the checker the
 * texture cache shows while the file loads.
 *
 * @param placeholder Whether the cache has no source for the id.
 * @param textureId Texture id.
 * @param texture Resolved texture.
 * @returns True when its image can be painted with.
 */
function paintTextureReady(placeholder: boolean, textureId: string, texture: unknown): boolean {
  if (placeholder) return false;
  if (isDefaultCheckerTextureId(textureId)) return true;
  return (texture as THREE.Texture).image !== getDebugCheckerTexture().image;
}

/**
 * Reads RGBA pixels from a texture image.
 *
 * @param source Texture image (data object, image, bitmap or canvas).
 * @param maximumSide Longest side drawn images are scaled down to.
 * @returns Image, or null when the source has no pixels yet.
 */
export function paintImageRead(source: unknown, maximumSide = PAINT_IMAGE_MAXIMUM_SIDE): PaintImage | null {
  if (typeof source !== 'object' || source === null) return null;
  const record = source as { width?: unknown; height?: unknown; data?: unknown };
  const width = typeof record.width === 'number' ? record.width : 0;
  const height = typeof record.height === 'number' ? record.height : 0;
  if (width <= 0 || height <= 0) return null;
  if (record.data instanceof Uint8Array || record.data instanceof Uint8ClampedArray) {
    return record.data.length >= width * height * 4 ? { width, height, data: record.data } : null;
  }
  if (typeof document === 'undefined') return null;
  const scale = Math.min(1, maximumSide / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (context === null) return null;
  try {
    context.drawImage(source as CanvasImageSource, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    return { width: pixels.width, height: pixels.height, data: pixels.data };
  } catch {
    return null;
  }
}
