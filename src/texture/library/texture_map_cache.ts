import * as THREE from 'three';
import { TextureLibrary } from './texture_library.js';
import { TextureBrowserEntry } from './texture_browser_entry.js';
import { getDebugCheckerTexture } from './factory_debug_texture.js';
import { getMissingCheckerImage } from './factory_missing_texture.js';
import { isDefaultCheckerTextureId } from './texture_id.js';
import {
  applyTextureFilterPolicy,
  createTextureFilterPolicy,
  type PolicyTextureFilter,
} from './policy_texture_filter.js';

/**
 * Loads and caches one THREE.Texture per texture id for surface assignment. A
 * missing id gets its own placeholder showing the pink missing checker (the id
 * stays assigned and is saved as it is), and the cache follows the bound
 * library: when a file appears, changes or disappears, the cached texture swaps
 * its image in place, so meshes never need a rebuild. The built-in checker is
 * never cached as a disposable user texture.
 */
export class TextureMapCache {
  private textures: Map<string, THREE.Texture>;
  private sources: Map<string, TextureBrowserEntry | null>;
  private library: TextureLibrary | null;
  private libraryUnlisten: (() => void) | null;
  private filterPolicy: PolicyTextureFilter;
  private usedRoot: THREE.Object3D | null;

  /** Creates an empty texture map cache with best-quality default filters. */
  constructor() {
    this.textures = new Map();
    this.sources = new Map();
    this.library = null;
    this.libraryUnlisten = null;
    this.filterPolicy = createTextureFilterPolicy('trilinear', 'max', 1);
    this.usedRoot = null;
  }

  /**
   * Sets the scene whose materials count as "used in the level".
   *
   * @param root Scene root, or null.
   */
  usedRootSet(root: THREE.Object3D | null): void {
    this.usedRoot = root;
  }

  /**
   * Lists the texture ids the level uses, whether or not their files exist.
   *
   * @returns Sorted ids (never the built-in checker).
   */
  usedIds(): string[] {
    const byTexture = new Map<THREE.Texture, string>();
    this.textures.forEach((texture, id) => byTexture.set(texture, id));
    const used = new Set<string>();
    this.usedRoot?.traverse((object) => {
      textureMapCacheMaps(object).forEach((map) => {
        const id = byTexture.get(map);
        if (id !== undefined) used.add(id);
      });
    });
    return [...used].sort();
  }

  /**
   * Lists the texture ids the level uses whose files are not available.
   *
   * @returns Sorted ids shown as the pink missing checker.
   */
  missingIds(): string[] {
    return this.usedIds().filter((id) => this.isPlaceholder(id));
  }

  /**
   * Binds the texture library used to resolve folder textures and follows its
   * changes.
   *
   * @param library Library instance, or null.
   */
  setLibrary(library: TextureLibrary | null): void {
    if (this.library === library) return;
    this.libraryUnlisten?.();
    this.library = library;
    this.libraryUnlisten = library?.listenerAdd(() => this.librarySync()) ?? null;
    this.librarySync();
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
   * Resolves a texture id to a renderable map. A missing id resolves to its own
   * placeholder that shows the checker until the library gains the file.
   *
   * @param textureId Stable texture id.
   * @returns THREE.Texture (shared checker, cached user map or placeholder).
   */
  resolve(textureId: string): THREE.Texture {
    if (isDefaultCheckerTextureId(textureId)) {
      return this.resolveDebugChecker();
    }
    const cached = this.textures.get(textureId);
    if (cached) return cached;
    const texture = createTexturePlaceholder(this.filterPolicy);
    this.textures.set(textureId, texture);
    this.sources.set(textureId, null);
    this.entryShow(textureId, this.library?.getEntryById(textureId) ?? null);
    return texture;
  }

  /**
   * Tells whether an id currently shows its placeholder (no file loaded).
   *
   * @param textureId Texture id.
   * @returns True when the cached texture has no library file.
   */
  isPlaceholder(textureId: string): boolean {
    return this.textures.has(textureId) && this.sources.get(textureId) === null;
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

  /**
   * Swaps every cached texture whose library file appeared, changed or
   * disappeared, in place: a new file loads into the same texture, a removed
   * one shows the pink missing checker until it returns.
   */
  librarySync(): void {
    this.textures.forEach((_texture, id) => {
      const entry = this.library?.getEntryById(id) ?? null;
      if (entry !== this.sources.get(id)) this.entryShow(id, entry);
    });
  }

  /** Same as {@link librarySync}; kept for callers that replaced the folder. */
  pruneMissingLibraryEntries(): void {
    this.librarySync();
  }

  /**
   * Shows a library file (or the pink missing checker when null) in an id's
   * cached texture.
   *
   * @param textureId Texture id.
   * @param entry Library entry, or null.
   */
  private entryShow(textureId: string, entry: TextureBrowserEntry | null): void {
    const texture = this.textures.get(textureId);
    if (!texture) return;
    this.sources.set(textureId, entry);
    if (entry === null) return textureImageSwap(texture, getMissingCheckerImage());
    if (isDefaultCheckerTextureId(entry.id)) return textureImageSwap(texture, getDebugCheckerTexture().image);
    const image = new Image();
    image.onload = () => {
      if (this.textures.get(textureId) === texture && this.sources.get(textureId) === entry)
        textureImageSwap(texture, image);
    };
    image.src = entry.previewObjectUrl;
  }

  /**
   * Disposes cached textures so their ids resolve again from the library.
   *
   * @param ids Texture ids to forget.
   */
  forget(ids: Iterable<string>): void {
    for (const id of ids) this.disposeId(id);
  }

  /** Disposes all cached user textures. */
  dispose(): void {
    this.textures.forEach((texture) => texture.dispose());
    this.textures.clear();
    this.sources.clear();
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
    this.sources.delete(textureId);
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
 * Returns the textures an object's materials show as their color map.
 *
 * @param object Scene object.
 * @returns Maps (may be empty).
 */
function textureMapCacheMaps(object: THREE.Object3D): THREE.Texture[] {
  const material = (object as Partial<THREE.Mesh>).material;
  if (material === undefined) return [];
  const materials = Array.isArray(material) ? material : [material];
  return materials.flatMap((each) => {
    const map = (each as Partial<THREE.MeshStandardMaterial>).map;
    return map ? [map] : [];
  });
}

/**
 * Builds a repeating sRGB texture showing the checker until a file loads.
 *
 * @param filterPolicy Filter policy applied at creation time.
 * @returns Configured THREE.Texture.
 */
function createTexturePlaceholder(filterPolicy: PolicyTextureFilter): THREE.Texture {
  const texture = new THREE.Texture(getDebugCheckerTexture().image);
  configureUserTexture(texture, filterPolicy);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Replaces a texture's image, releasing the GPU copy first so a different size
 * uploads cleanly.
 *
 * @param texture Texture to update.
 * @param image New image.
 */
function textureImageSwap(texture: THREE.Texture, image: unknown): void {
  if (texture.image === image) return;
  texture.dispose();
  texture.image = image;
  texture.needsUpdate = true;
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
