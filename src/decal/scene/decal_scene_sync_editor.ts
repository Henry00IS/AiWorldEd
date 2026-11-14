import type * as THREE from 'three';
import { getTextureMapCache } from '@/texture/library/texture_map_cache.js';
import { decalImageResolve } from '@/decal/presentation/decal_default_image.js';
import { DecalSceneSync } from './decal_scene_sync.js';

/**
 * Resolves a decal texture id through the shared texture map cache.
 *
 * @param textureId Decal texture id, or empty for the marker image.
 * @returns Image texture.
 */
export function decalEditorImageResolve(textureId: string): THREE.Texture {
  return decalImageResolve(textureId, (libraryId) => getTextureMapCache().resolve(libraryId));
}

/**
 * Creates the decal synchronizer the editor viewports run once per frame,
 * resolving images through the shared texture map cache.
 *
 * @returns Synchronizer with editor services.
 */
export function decalSceneSyncEditorCreate(): DecalSceneSync {
  return new DecalSceneSync({ resolveImage: decalEditorImageResolve, now: () => performance.now() });
}
