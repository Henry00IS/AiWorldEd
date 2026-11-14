import * as THREE from 'three';
import { DECAL_PRESENTATION_USERDATA_KEY } from '@/decal/presentation/decal_presentation.js';
import { getTextureMapCache } from '@/texture/library/texture_map_cache.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import { DecalSceneSync } from './decal_scene_sync.js';

/**
 * Resolves a decal texture id through the shared texture map cache. An empty id
 * shows the editor's checker, the default texture everywhere else too.
 *
 * @param textureId Decal texture id, or empty for the checker.
 * @returns Image texture.
 */
export function decalEditorImageResolve(textureId: string): THREE.Texture {
  return getTextureMapCache().resolve(textureId === '' ? DEFAULT_CHECKER_TEXTURE_ID : textureId);
}

/** Per-frame decal drawing of the editor viewports. */
export interface DecalSceneSyncEditor {
  /**
   * Brings the decals of a world up to date, drawing them into an overlay kept
   * under the helpers root so picking, selection, edit mode and hierarchy
   * passes over the world never meet a decal mesh.
   *
   * @param world Editor world root.
   * @param helpers Helpers root of the shared scene.
   */
  sync(world: THREE.Object3D, helpers: THREE.Object3D): void;
}

/**
 * Creates the editor's decal drawing, resolving images through the shared
 * texture map cache.
 *
 * @returns Editor decal drawing.
 */
export function decalSceneSyncEditorCreate(): DecalSceneSyncEditor {
  const overlay = new THREE.Group();
  overlay.name = 'Decal Overlay';
  overlay.userData[DECAL_PRESENTATION_USERDATA_KEY] = true;
  const decals = new DecalSceneSync({ resolveImage: decalEditorImageResolve, now: () => performance.now(), overlay });
  return {
    sync(world, helpers) {
      if (overlay.parent !== helpers) helpers.add(overlay);
      decals.sync(world);
    },
  };
}
