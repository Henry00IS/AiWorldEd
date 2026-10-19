import * as THREE from 'three';
import { TextureLibrary } from './texture_library.js';
import { TextureBrowserEntry } from './texture_browser_entry.js';
import { getDebugCheckerTexture } from './factory_debug_texture.js';
import { DEFAULT_CHECKER_TEXTURE_ID, isDefaultCheckerTextureId } from './texture_id.js';
import {
  applyTextureFilterPolicy,
  createTextureFilterPolicy,
  type PolicyTextureFilter,
} from './policy_texture_filter.js';

/**
 * Loads and caches THREE.Texture instances for surface assignment. The built-in
 * checker is never cached as a disposable user texture.
 */
export class TextureMapCache {
  private textures: Map<string, THREE.Texture>;
  private library: TextureLibrary | null;
  private filterPolicy: PolicyTextureFilter;

  /** Creates an empty texture map cache with best-quality default filters. */
  constructor() {
    this.textures = new Map();
    this.library = null;
    this.filterPolicy = createTextureFilterPolicy('trilinear', 'max', 1);
  }

  /**
   * Binds the texture library used to resolve folder textures.
   *
   * @param library Library instance, or null.
   */
  setLibrary(library: TextureLibrary | null): void {
    this.library = library;
  }

  /**
   * Returns the library used to resolve folder textures.
   *
   * @returns Library, or null when none is bound.
   */
  getLibrary(): TextureLibrary | null {
    return this.library;
  }

  /**
   * Updates filter and anisotropy policy for all content maps, including the
   * shared built-in debug checker.
   *
   * @param policy Runtime filter policy including GPU max anisotropy.
   */
  setFilterPolicy(policy: PolicyTextureFilter): void {
    this.filterPolicy = policy;
    this.textures.forEach((texture) => applyTextureFilterPolicy(texture, policy));
    this.applyFilterPolicyToDebugChecker();
  }

  /**
   * Returns the active filter policy used for new and cached maps.
   *
   * @returns Current filter policy.
   */
  getFilterPolicy(): PolicyTextureFilter {
    return { ...this.filterPolicy };
  }

  /**
   * Resolves a texture id to a renderable map. Missing ids fall back to the
   * built-in checker.
   *
   * @param textureId Stable texture id.
   * @returns THREE.Texture (shared checker or cached user map).
   */
  resolve(textureId: string): THREE.Texture {
    if (isDefaultCheckerTextureId(textureId)) {
      return this.resolveDebugChecker();
    }
    const cached = this.textures.get(textureId);
    if (cached) return cached;
    const entry = this.library?.getEntryById(textureId) ?? null;
    if (!entry || isDefaultCheckerTextureId(entry.id)) {
      return this.resolveDebugChecker();
    }
    const texture = createTextureFromBrowserEntry(entry, this.filterPolicy);
    this.textures.set(textureId, texture);
    return texture;
  }

  /**
   * Returns the shared debug checker with the active global filter policy.
   *
   * @returns Shared debug checker texture.
   */
  private resolveDebugChecker(): THREE.Texture {
    this.applyFilterPolicyToDebugChecker();
    return getDebugCheckerTexture();
  }

  /** Pushes the active filter policy onto the shared built-in debug checker. */
  private applyFilterPolicyToDebugChecker(): void {
    applyTextureFilterPolicy(getDebugCheckerTexture(), this.filterPolicy);
  }

  /** Disposes user textures that are no longer present in the library. */
  pruneMissingLibraryEntries(): void {
    if (!this.library) return;
    const keep = new Set(this.library.getEntries().map((entry) => entry.id));
    const staleIds: string[] = [];
    this.textures.forEach((_texture, id) => {
      if (!keep.has(id)) staleIds.push(id);
    });
    staleIds.forEach((id) => this.disposeId(id));
  }

  /** Disposes all cached user textures. */
  dispose(): void {
    this.textures.forEach((texture) => texture.dispose());
    this.textures.clear();
  }

  /**
   * Disposes one cached texture by id.
   *
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
 *
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
 *
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
 *
 * @param entry Texture browser entry with a live object URL.
 * @param filterPolicy Filter policy applied at creation time.
 * @returns Configured THREE.Texture (updates when the image loads).
 */
function createTextureFromBrowserEntry(entry: TextureBrowserEntry, filterPolicy: PolicyTextureFilter): THREE.Texture {
  if (entry.id === DEFAULT_CHECKER_TEXTURE_ID) {
    const checker = getDebugCheckerTexture();
    applyTextureFilterPolicy(checker, filterPolicy);
    return checker;
  }
  const image = new Image();
  const texture = new THREE.Texture(image);
  configureUserTexture(texture, filterPolicy);
  image.onload = () => {
    texture.needsUpdate = true;
  };
  image.src = entry.previewObjectUrl;
  return texture;
}

/**
 * Applies wrap and filter defaults for level surface maps.
 *
 * @param texture Texture to configure.
 * @param filterPolicy Active filter policy.
 */
function configureUserTexture(texture: THREE.Texture, filterPolicy: PolicyTextureFilter): void {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  applyTextureFilterPolicy(texture, filterPolicy);
}
