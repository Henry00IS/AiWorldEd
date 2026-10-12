import * as THREE from 'three';
import {
  FACE_TEXTURE_MAPS_USERDATA_KEY,
  FaceTextureMapEntry,
  cloneFaceTextureMapEntry,
} from './face_texture_mapping.js';

/**
 * Reads face texture map entries from mesh userData.
 *
 * @param mesh Mesh to read.
 * @returns Cloned entries array (never the live reference).
 */
export function getFaceTextureMaps(mesh: THREE.Mesh): FaceTextureMapEntry[] {
  const raw = getFaceTextureMapsLive(mesh);
  return raw.map((entry) => cloneFaceTextureMapEntry(entry));
}

/**
 * Returns the live face texture map table without cloning. Callers must not
 * mutate the returned arrays; use this for read-only lookups on large solid
 * results where cloning every entry is prohibitively expensive.
 *
 * @param mesh Mesh to read.
 * @returns Live entries array or empty array.
 */
export function getFaceTextureMapsLive(mesh: THREE.Mesh): readonly FaceTextureMapEntry[] {
  const raw = mesh.userData[FACE_TEXTURE_MAPS_USERDATA_KEY];
  if (!Array.isArray(raw)) return [];
  return raw as FaceTextureMapEntry[];
}

/**
 * Writes face texture map entries onto mesh userData.
 *
 * @param mesh Target mesh.
 * @param entries Mapping table to store (cloned).
 */
export function setFaceTextureMaps(mesh: THREE.Mesh, entries: FaceTextureMapEntry[]): void {
  mesh.userData[FACE_TEXTURE_MAPS_USERDATA_KEY] = entries.map((entry) => cloneFaceTextureMapEntry(entry));
}

/**
 * Stores face texture map entries without deep-cloning triangle index arrays.
 * Use for solid result meshes rebuilt every frame from region tables. Callers
 * must not mutate the stored arrays after writing.
 *
 * @param mesh Target mesh.
 * @param entries Mapping table to store by reference.
 */
export function setFaceTextureMapsShared(mesh: THREE.Mesh, entries: FaceTextureMapEntry[]): void {
  mesh.userData[FACE_TEXTURE_MAPS_USERDATA_KEY] = entries;
}

/**
 * Upserts a mapping entry for a triangle region, replacing overlaps.
 *
 * @param mesh Mesh owning the maps.
 * @param triangleIndices Region triangle indices.
 * @param mapping Mapping to store.
 */
export function upsertFaceTextureMap(
  mesh: THREE.Mesh,
  triangleIndices: number[],
  mapping: FaceTextureMapEntry['mapping'],
): void {
  const sorted = triangleIndices.slice().sort((a, b) => a - b);
  const indexSet = new Set(sorted);
  const kept = collectEntriesOutsideTriangleSet(getFaceTextureMaps(mesh), indexSet);
  kept.push({
    triangleIndices: sorted,
    mapping: { ...mapping },
  });
  setFaceTextureMaps(mesh, kept);
}

/**
 * Keeps stored map triangles that are outside a replacement set.
 *
 * @param entries Existing map entries.
 * @param indexSet Triangle indices being replaced.
 * @returns Entries that still cover some triangles.
 */
function collectEntriesOutsideTriangleSet(
  entries: readonly FaceTextureMapEntry[],
  indexSet: ReadonlySet<number>,
): FaceTextureMapEntry[] {
  const kept: FaceTextureMapEntry[] = [];
  for (const entry of entries) {
    appendEntryOutsideSet(entry, indexSet, kept);
  }
  return kept;
}

/**
 * Appends one entry after removing triangles that the replacement owns.
 *
 * @param entry Existing entry.
 * @param indexSet Triangle indices being replaced.
 * @param kept Output list.
 */
function appendEntryOutsideSet(
  entry: FaceTextureMapEntry,
  indexSet: ReadonlySet<number>,
  kept: FaceTextureMapEntry[],
): void {
  const remaining = entry.triangleIndices.filter((index) => !indexSet.has(index));
  if (remaining.length === 0) {
    return;
  }
  kept.push({
    triangleIndices: remaining,
    mapping: entry.mapping,
  });
}
