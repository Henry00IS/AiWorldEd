import { getTextureMapCache } from '@/texture/library/texture_map_cache.js';
import { decalImageResolve } from '@/decal/presentation/decal_default_image.js';
import { DecalSceneSync } from './decal_scene_sync.js';

/**
 * Creates the decal synchronizer the editor viewports run once per frame,
 * resolving images through the shared texture map cache.
 *
 * @returns Synchronizer with editor services.
 */
export function decalSceneSyncEditorCreate(): DecalSceneSync {
  return new DecalSceneSync({
    resolveImage: (textureId) => decalImageResolve(textureId, (libraryId) => getTextureMapCache().resolve(libraryId)),
    now: () => performance.now(),
  });
}
