import * as THREE from 'three';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import { createDefaultFaceTextureMapping } from './face_texture_mapping.js';
import { getFaceTextureMapsLive, setFaceTextureMaps } from './face_texture_storage.js';

/**
 * UserData key for the single texture identity on a free content mesh. Free
 * meshes carry one material map; per-triangle multi-texture is solid-only.
 */
export const CONTENT_MESH_TEXTURE_ID_USERDATA_KEY = 'contentMeshTextureId';

/**
 * Reads the mesh-level texture id for a free content mesh.
 *
 * @param mesh Content mesh.
 * @returns Texture identity string.
 */
export function readContentMeshTextureId(mesh: THREE.Mesh): string {
  const stored = mesh.userData[CONTENT_MESH_TEXTURE_ID_USERDATA_KEY];
  if (typeof stored === 'string' && stored.length > 0) {
    return stored;
  }
  const fromMaps = readUniformTextureIdFromFaceMaps(mesh);
  if (fromMaps) {
    return fromMaps;
  }
  return DEFAULT_CHECKER_TEXTURE_ID;
}

/**
 * Writes the mesh-level texture id. Updates textureId on existing face map
 * entries in place (no triangle-index cloning). Creates one whole-mesh map
 * entry when none exist. Does not rebuild materials.
 *
 * @param mesh Content mesh.
 * @param textureId Texture identity.
 */
export function writeContentMeshTextureId(mesh: THREE.Mesh, textureId: string): void {
  const resolvedId = textureId || DEFAULT_CHECKER_TEXTURE_ID;
  mesh.userData[CONTENT_MESH_TEXTURE_ID_USERDATA_KEY] = resolvedId;
  patchExistingFaceMapTextureIds(mesh, resolvedId);
}

/**
 * Returns whether face maps already share one texture id (including a single
 * whole-mesh entry with empty triangle indices).
 *
 * @param mesh Content mesh.
 * @returns Uniform texture id, or null when mixed / empty maps.
 */
export function readUniformTextureIdFromFaceMaps(mesh: THREE.Mesh): string | null {
  const entries = getFaceTextureMapsLive(mesh);
  if (entries.length === 0) {
    return null;
  }
  const firstId = entries[0]?.mapping.textureId || DEFAULT_CHECKER_TEXTURE_ID;
  for (let index = 1; index < entries.length; index++) {
    const nextId = entries[index]?.mapping.textureId || DEFAULT_CHECKER_TEXTURE_ID;
    if (nextId !== firstId) {
      return null;
    }
  }
  return firstId;
}

/**
 * Patches textureId on live face maps without cloning triangle arrays. Inserts
 * a whole-mesh entry when maps are missing.
 *
 * @param mesh Content mesh.
 * @param textureId Texture identity.
 */
function patchExistingFaceMapTextureIds(mesh: THREE.Mesh, textureId: string): void {
  const live = mesh.userData['faceTextureMaps'];
  if (Array.isArray(live) && live.length > 0) {
    for (const entry of live as Array<{ mapping?: { textureId?: string } }>) {
      if (entry.mapping) {
        entry.mapping.textureId = textureId;
      }
    }
    return;
  }
  setFaceTextureMaps(mesh, [
    {
      triangleIndices: [],
      mapping: createDefaultFaceTextureMapping(textureId),
    },
  ]);
}
