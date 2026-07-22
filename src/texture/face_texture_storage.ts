import * as THREE from 'three';
import {
  FACE_TEXTURE_MAPS_USERDATA_KEY,
  FaceTextureMapEntry,
  cloneFaceTextureMapEntry
} from './face_texture_mapping.js';

/**
 * Reads face texture map entries from mesh userData.
 * @param mesh Mesh to read.
 * @returns Cloned entries array (never the live reference).
 */
export function getFaceTextureMaps(mesh: THREE.Mesh): FaceTextureMapEntry[] {
  const raw = mesh.userData[FACE_TEXTURE_MAPS_USERDATA_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.map((entry: FaceTextureMapEntry) => cloneFaceTextureMapEntry(entry));
}

/**
 * Writes face texture map entries onto mesh userData.
 * @param mesh Target mesh.
 * @param entries Mapping table to store (cloned).
 */
export function setFaceTextureMaps(
  mesh: THREE.Mesh,
  entries: FaceTextureMapEntry[]
): void {
  mesh.userData[FACE_TEXTURE_MAPS_USERDATA_KEY] = entries.map((entry) =>
    cloneFaceTextureMapEntry(entry)
  );
}

/**
 * Clears all stored face texture maps on a mesh.
 * @param mesh Target mesh.
 */
export function clearFaceTextureMaps(mesh: THREE.Mesh): void {
  delete mesh.userData[FACE_TEXTURE_MAPS_USERDATA_KEY];
}

/**
 * Upserts a mapping entry for a triangle region, replacing overlaps.
 * @param mesh Mesh owning the maps.
 * @param triangleIndices Region triangle indices.
 * @param mapping Mapping to store.
 */
export function upsertFaceTextureMap(
  mesh: THREE.Mesh,
  triangleIndices: number[],
  mapping: FaceTextureMapEntry['mapping']
): void {
  const sorted = triangleIndices.slice().sort((a, b) => a - b);
  const indexSet = new Set(sorted);
  const existing = getFaceTextureMaps(mesh).filter((entry) => {
    return !entry.triangleIndices.some((index) => indexSet.has(index));
  });
  existing.push({
    triangleIndices: sorted,
    mapping: { ...mapping }
  });
  setFaceTextureMaps(mesh, existing);
}
