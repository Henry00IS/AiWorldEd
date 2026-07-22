import * as THREE from 'three';
import { TextureLibrary } from './texture_library.js';
import { TextureBrowserEntry } from './texture_browser_entry.js';
import { getDebugCheckerTexture } from './debug_texture_factory.js';
import {
  DEFAULT_CHECKER_TEXTURE_ID,
  isDefaultCheckerTextureId
} from './texture_id.js';

/**
 * Loads and caches THREE.Texture instances for surface assignment.
 * The built-in checker is never cached as a disposable user texture.
 */
export class TextureMapCache {
  private textures: Map<string, THREE.Texture>;
  private library: TextureLibrary | null;

  /**
   * Creates an empty texture map cache.
   */
  constructor() {
    this.textures = new Map();
    this.library = null;
  }

  /**
   * Binds the texture library used to resolve folder textures.
   * @param library Library instance, or null.
   */
  setLibrary(library: TextureLibrary | null): void {
    this.library = library;
  }

  /**
   * Resolves a texture id to a renderable map.
   * Missing ids fall back to the built-in checker.
   * @param textureId Stable texture id.
   * @returns THREE.Texture (shared checker or cached user map).
   */
  resolve(textureId: string): THREE.Texture {
    if (isDefaultCheckerTextureId(textureId)) {
      return getDebugCheckerTexture();
    }
    const cached = this.textures.get(textureId);
    if (cached) return cached;
    const entry = this.library?.getEntryById(textureId) ?? null;
    if (!entry || isDefaultCheckerTextureId(entry.id)) {
      return getDebugCheckerTexture();
    }
    const texture = createTextureFromBrowserEntry(entry);
    this.textures.set(textureId, texture);
    return texture;
  }

  /**
   * Disposes user textures that are no longer present in the library.
   */
  pruneMissingLibraryEntries(): void {
    if (!this.library) return;
    const keep = new Set(
      this.library.getEntries().map((entry) => entry.id)
    );
    const staleIds: string[] = [];
    this.textures.forEach((_texture, id) => {
      if (!keep.has(id)) staleIds.push(id);
    });
    staleIds.forEach((id) => this.disposeId(id));
  }

  /**
   * Disposes all cached user textures.
   */
  dispose(): void {
    this.textures.forEach((texture) => texture.dispose());
    this.textures.clear();
  }

  /**
   * Disposes one cached texture by id.
   * @param textureId Id to remove.
   */
  private disposeId(textureId: string): void {
    const texture = this.textures.get(textureId);
    if (!texture) return;
    texture.dispose();
    this.textures.delete(textureId);
  }
}

let sharedCache: TextureMapCache | null = null;

/**
 * Returns the process-wide texture map cache.
 * @returns Shared TextureMapCache.
 */
export function getTextureMapCache(): TextureMapCache {
  if (!sharedCache) {
    sharedCache = new TextureMapCache();
  }
  return sharedCache;
}

/**
 * Replaces the shared cache (tests only).
 * @param cache Cache to install, or null to clear.
 */
export function setTextureMapCacheForTests(cache: TextureMapCache | null): void {
  if (sharedCache && sharedCache !== cache) {
    sharedCache.dispose();
  }
  sharedCache = cache;
}

/**
 * Builds a repeating sRGB texture from a browser entry preview URL.
 * @param entry Texture browser entry with a live object URL.
 * @returns Configured THREE.Texture (updates when the image loads).
 */
function createTextureFromBrowserEntry(
  entry: TextureBrowserEntry
): THREE.Texture {
  if (entry.id === DEFAULT_CHECKER_TEXTURE_ID) {
    return getDebugCheckerTexture();
  }
  const image = new Image();
  const texture = new THREE.Texture(image);
  configureUserTexture(texture);
  image.onload = () => {
    texture.needsUpdate = true;
  };
  image.src = entry.previewObjectUrl;
  return texture;
}

/**
 * Applies wrap and filter defaults for level surface maps.
 * @param texture Texture to configure.
 */
function configureUserTexture(texture: THREE.Texture): void {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
}
