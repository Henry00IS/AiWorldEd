import * as THREE from 'three';
import { TextureLibrary } from './texture_library.js';
import { TextureBrowserEntry, textureBrowserEntryImageSource } from './texture_browser_entry.js';
import { getImageManager } from '@/texture/image_manager/image_manager_shared.js';
import type { ImageManagerHandle } from '@/texture/image_manager/manager_image.js';
import type { ImageManagerFullImage } from '@/texture/image_manager/image_manager_types.js';
import { getDebugCheckerTexture } from './factory_debug_texture.js';
import { getMissingCheckerImage } from './factory_missing_texture.js';
import { isDefaultCheckerTextureId } from './texture_id.js';
import { TextureLibraryAlias } from './texture_library_alias.js';
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
 * its image in place, so meshes never need a rebuild. An id without a file of
 * its own shows the file {@link TextureLibraryAlias} matches (same content hash,
 * or the one texture of that file name), so pending references resolve live
 * without changing the id. The built-in checker is never cached as a disposable
 * user texture.
 *
 * Images come from the image manager: each id holds a full-image handle for the
 * image its texture shows (ids showing the same file share one decoded image),
 * and a GPU handle while materials made by the surface builder use the texture
 * ({@link materialBind}); once none do, the manager frees the upload
 * (texture.dispose()) after a while or when over the VRAM budget. The decoded
 * image stays while the texture shows it, as three.js reads it again after a
 * context loss and for every other window's renderer.
 */
export class TextureMapCache {
  private textures: Map<string, THREE.Texture>;
  private sources: Map<string, TextureBrowserEntry | null>;
  private library: TextureLibrary | null;
  private libraryUnlisten: (() => void) | null;
  private filterPolicy: PolicyTextureFilter;
  private usedRoot: THREE.Object3D | null;
  private readonly alias = new TextureLibraryAlias();
  private readonly loadFailedListeners = new Set<(entry: TextureBrowserEntry) => void>();
  /** Full image each id's texture shows. */
  private readonly shownHandles = new Map<string, ImageManagerHandle<ImageManagerFullImage>>();
  /** Full image each id is loading, to show once loaded. */
  private readonly pendingHandles = new Map<string, ImageManagerHandle<ImageManagerFullImage>>();
  /** GPU upload of each id's texture while materials use it. */
  private readonly gpuHandles = new Map<string, { url: string; handle: ImageManagerHandle<object> }>();
  /** Number of live materials using each id's texture. */
  private readonly materialUsers = new Map<string, number>();
  /** Id of each cached texture. */
  private readonly textureIds = new WeakMap<THREE.Texture, string>();

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
   * Lists every texture id resolved this session: the level's textures plus any
   * a deleted, undone or redoable object still points at, and the files shown
   * for them through an alias. Texture cleanup treats them all as in use.
   *
   * @returns Ids (never the built-in checker).
   */
  cachedIds(): string[] {
    const ids = new Set(this.textures.keys());
    // Files shown for another id through an alias are in use too.
    this.sources.forEach((entry) => {
      if (entry !== null && !isDefaultCheckerTextureId(entry.id)) ids.add(entry.id);
    });
    return [...ids];
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
    // Exporters name map files after the texture (textures/brick.png → brick.png).
    texture.name = textureId;
    this.textures.set(textureId, texture);
    this.textureIds.set(texture, textureId);
    this.sources.set(textureId, null);
    this.entryShow(textureId, this.alias.resolve(this.library, textureId));
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
      const entry = this.alias.resolve(this.library, id);
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
    this.pendingHandles.get(textureId)?.release();
    this.pendingHandles.delete(textureId);
    if (entry === null || isDefaultCheckerTextureId(entry.id)) {
      textureImageSwap(texture, entry === null ? getMissingCheckerImage() : getDebugCheckerTexture().image);
      this.shownRelease(textureId);
      return;
    }
    const manager = getImageManager();
    if (!manager.has(entry.previewObjectUrl)) manager.sourceSet(textureBrowserEntryImageSource(entry, 'texture'));
    const handle = manager.acquireFull(entry.previewObjectUrl)!;
    this.pendingHandles.set(textureId, handle);
    handle.onReady((image) => {
      if (this.pendingHandles.get(textureId) !== handle) return;
      this.pendingHandles.delete(textureId);
      if (image === null) {
        handle.release();
        this.loadFailedListeners.forEach((listener) => listener(entry));
        return;
      }
      if (this.textures.get(textureId) !== texture || this.sources.get(textureId) !== entry) return handle.release();
      textureImageSwap(texture, image);
      this.shownRelease(textureId);
      this.shownHandles.set(textureId, handle);
      this.gpuSync(textureId);
    });
  }

  /**
   * Lets go of the image an id's texture showed (it now shows another one).
   *
   * @param textureId Texture id.
   */
  private shownRelease(textureId: string): void {
    this.shownHandles.get(textureId)?.release();
    this.shownHandles.delete(textureId);
    this.gpuSync(textureId);
  }

  /**
   * Holds the GPU upload of an id's texture while materials use it and it shows
   * a library image; lets go of it otherwise.
   *
   * @param textureId Texture id.
   */
  private gpuSync(textureId: string): void {
    const texture = this.textures.get(textureId);
    const shown = this.shownHandles.get(textureId);
    const url = (this.materialUsers.get(textureId) ?? 0) > 0 && texture && shown ? shown.key : null;
    const held = this.gpuHandles.get(textureId);
    if (held?.url === url) return;
    if (url !== null && texture) {
      const handle = getImageManager().acquireGpu(url, texture, {
        mipmaps: textureMapCacheMipmapped(texture),
        dispose: () => texture.dispose(),
      });
      if (handle !== null) this.gpuHandles.set(textureId, { url, handle });
      else this.gpuHandles.delete(textureId);
    } else this.gpuHandles.delete(textureId);
    held?.handle.release();
  }

  /**
   * Counts a material as a user of a cached texture until the material is
   * disposed, so the texture's GPU memory can be freed once no material uses
   * it. Textures not from this cache (the built-in checker) are ignored.
   *
   * @param material Material showing the texture.
   * @param texture Its map.
   */
  materialBind(material: THREE.Material, texture: THREE.Texture): void {
    const id = this.textureIds.get(texture);
    if (id === undefined || this.textures.get(id) !== texture) return;
    this.materialUsers.set(id, (this.materialUsers.get(id) ?? 0) + 1);
    this.gpuSync(id);
    const unbind = (): void => {
      material.removeEventListener('dispose', unbind);
      const users = (this.materialUsers.get(id) ?? 1) - 1;
      if (users > 0) this.materialUsers.set(id, users);
      else this.materialUsers.delete(id);
      if (this.textures.get(id) === texture) this.gpuSync(id);
    };
    material.addEventListener('dispose', unbind);
  }

  /**
   * Calls a listener whenever a library file fails to load as an image.
   *
   * @param listener Receives the entry whose image failed.
   * @returns Removes the listener.
   */
  loadFailedListen(listener: (entry: TextureBrowserEntry) => void): () => void {
    this.loadFailedListeners.add(listener);
    return () => this.loadFailedListeners.delete(listener);
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
    [...this.textures.keys()].forEach((id) => this.handlesRelease(id));
    this.textures.forEach((texture) => texture.dispose());
    this.textures.clear();
    this.sources.clear();
  }

  /**
   * Lets go of every image handle an id holds.
   *
   * @param textureId Texture id.
   */
  private handlesRelease(textureId: string): void {
    this.pendingHandles.get(textureId)?.release();
    this.pendingHandles.delete(textureId);
    this.shownHandles.get(textureId)?.release();
    this.shownHandles.delete(textureId);
    this.gpuHandles.get(textureId)?.handle.release();
    this.gpuHandles.delete(textureId);
  }

  /**
   * Disposes one cached texture by id.
   *
   * @param textureId Id to remove.
   */
  private disposeId(textureId: string): void {
    const texture = this.textures.get(textureId);
    if (!texture) return;
    this.handlesRelease(textureId);
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
 * Tells whether a texture uploads a mip chain.
 *
 * @param texture Texture.
 * @returns True with generated mipmaps and a mipmapped minification filter.
 */
function textureMapCacheMipmapped(texture: THREE.Texture): boolean {
  return (
    texture.generateMipmaps && texture.minFilter !== THREE.NearestFilter && texture.minFilter !== THREE.LinearFilter
  );
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
