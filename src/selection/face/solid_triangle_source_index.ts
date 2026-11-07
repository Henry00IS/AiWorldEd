import * as THREE from 'three';
import { SOLID_TRIANGLE_SOURCES_USERDATA_KEY } from '@/solid/model/solid_model_keys.js';
import type { SolidTriangleSourceRef } from './solid_result_face_indices.js';

/** UserData key for the cached brush-face → triangle index map. */
const SOLID_FACE_INDEX_CACHE_USERDATA_KEY = 'solidFaceTriangleIndexCache';

/** Cached index of solid result triangles by authored brush face. */
interface SolidFaceIndexCache {
  sources: SolidTriangleSourceRef[];
  byFaceKey: Map<string, number[]>;
}

/**
 * Returns all triangle indices that belong to the same solid brush face as the
 * seed triangle. Uses a cached multimap so large solid results expand in O(k)
 * where k is triangles on that face, not O(all triangles).
 *
 * @param mesh Solid result mesh with triangle source userData.
 * @param seedFaceIndex Clicked triangle index.
 * @returns Matching triangle indices, or null when the mesh is not a solid
 *   result.
 */
export function findSameSolidBrushSurfaceIndicesFast(mesh: THREE.Mesh, seedFaceIndex: number): number[] | null {
  const sources = readSolidTriangleSources(mesh);
  if (!sources) return null;
  const seed = sources[seedFaceIndex];
  if (!seed?.brushId || typeof seed.surfaceIndex !== 'number') {
    return [seedFaceIndex];
  }
  const cache = getOrBuildSolidFaceIndexCache(mesh, sources);
  const key = buildSolidFaceKey(seed.brushId, seed.surfaceIndex, seed.derivedId);
  const indices = cache.byFaceKey.get(key);
  if (!indices || indices.length === 0) {
    return [seedFaceIndex];
  }
  return indices;
}

/**
 * Builds a stable region key for drag-paint dedupe (one key per brush face). A
 * modifier output face gets its own key that never parses as an authored brush
 * face, so its source face is not reported as selected through it.
 *
 * @param mesh Hit mesh.
 * @param faceIndex Seed triangle index.
 * @returns Region identity string.
 */
export function buildFacePickRegionKey(mesh: THREE.Mesh, faceIndex: number): string {
  const sources = readSolidTriangleSources(mesh);
  const seed = sources?.[faceIndex];
  if (!seed?.brushId || typeof seed.surfaceIndex !== 'number') return `${mesh.uuid}|tri:${faceIndex}`;
  const authoredKey = `${mesh.uuid}|${seed.brushId}|${seed.surfaceIndex}`;
  return seed.derivedId === undefined ? authoredKey : `${authoredKey}|copy:${seed.derivedId}`;
}

/**
 * Returns or builds the brush-face multimap for a solid result mesh.
 *
 * @param mesh Solid result mesh.
 * @param sources Per-triangle source table currently on the mesh.
 * @returns Cache entry valid for the given sources reference.
 */
function getOrBuildSolidFaceIndexCache(mesh: THREE.Mesh, sources: SolidTriangleSourceRef[]): SolidFaceIndexCache {
  const existing = mesh.userData[SOLID_FACE_INDEX_CACHE_USERDATA_KEY] as SolidFaceIndexCache | undefined;
  if (existing && existing.sources === sources) {
    return existing;
  }
  const byFaceKey = new Map<string, number[]>();
  for (let index = 0; index < sources.length; index++) {
    const source = sources[index];
    if (!source?.brushId || typeof source.surfaceIndex !== 'number') continue;
    const key = buildSolidFaceKey(source.brushId, source.surfaceIndex, source.derivedId);
    const list = byFaceKey.get(key);
    if (list) {
      list.push(index);
    } else {
      byFaceKey.set(key, [index]);
    }
  }
  const cache: SolidFaceIndexCache = { sources, byFaceKey };
  mesh.userData[SOLID_FACE_INDEX_CACHE_USERDATA_KEY] = cache;
  return cache;
}

/**
 * Builds a map key for one solid brush face. Triangles of a modifier output (a
 * generated copy) key by their derived id too, so an authored face never groups
 * with its copies.
 *
 * @param brushId Brush instance id.
 * @param surfaceIndex Brush face index.
 * @param derivedId Modifier output id, or undefined for authored triangles.
 * @returns Map key.
 */
function buildSolidFaceKey(brushId: string, surfaceIndex: number, derivedId?: string): string {
  return derivedId === undefined ? `${brushId}\0${surfaceIndex}` : `${brushId}\0${surfaceIndex}\0${derivedId}`;
}

/**
 * Finds the first result triangle that still belongs to an authored brush face.
 * Used after undo/remesh to rebind a face selection to a live seed index.
 *
 * @param mesh Solid result mesh.
 * @param brushId Brush instance id.
 * @param surfaceIndex Brush face index.
 * @returns Triangle index, or -1 when the surface is gone.
 */
export function findFirstTriangleForBrushSurface(mesh: THREE.Mesh, brushId: string, surfaceIndex: number): number {
  const sources = readSolidTriangleSources(mesh);
  if (!sources) return -1;
  const cache = getOrBuildSolidFaceIndexCache(mesh, sources);
  const indices = cache.byFaceKey.get(buildSolidFaceKey(brushId, surfaceIndex));
  if (!indices || indices.length === 0) return -1;
  return indices[0]!;
}

/**
 * Parses a face pick region key into solid brush identity when possible.
 *
 * @param regionKey Key from buildFacePickRegionKey.
 * @param meshUuid Expected mesh uuid prefix.
 * @returns Brush face identity, or null for ordinary triangle keys.
 */
export function parseSolidRegionKey(
  regionKey: string,
  meshUuid: string,
): { brushId: string; surfaceIndex: number } | null {
  const prefix = `${meshUuid}|`;
  if (!regionKey.startsWith(prefix)) return null;
  const rest = regionKey.slice(prefix.length);
  if (rest.startsWith('tri:')) return null;
  const separator = rest.lastIndexOf('|');
  if (separator <= 0) return null;
  const brushId = rest.slice(0, separator);
  const surfaceIndex = Number(rest.slice(separator + 1));
  if (!brushId || !Number.isFinite(surfaceIndex)) return null;
  return { brushId, surfaceIndex };
}

/**
 * Reads solid triangle sources from mesh userData when present.
 *
 * @param mesh Mesh that may be a solid CSG result.
 * @returns Source array, or null when missing/invalid.
 */
function readSolidTriangleSources(mesh: THREE.Mesh): SolidTriangleSourceRef[] | null {
  const raw = mesh.userData[SOLID_TRIANGLE_SOURCES_USERDATA_KEY];
  if (!Array.isArray(raw) || raw.length === 0) return null;
  return raw as SolidTriangleSourceRef[];
}
