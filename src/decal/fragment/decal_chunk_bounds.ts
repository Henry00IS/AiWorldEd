import * as THREE from 'three';
import type { SolidBrushMeshChunk } from '@/solid/mesh/solid_brush_mesh_chunk.js';

const decalChunkBoundsByChunk = new WeakMap<SolidBrushMeshChunk, THREE.Box3>();

/**
 * Returns the model-space bounds of a brush chunk, measured once per chunk
 * object. Chunks are replaced, never edited, when their brush is remeshed.
 *
 * @param chunk Brush chunk.
 * @returns Bounds of the chunk's triangles.
 */
export function decalChunkBounds(chunk: SolidBrushMeshChunk): THREE.Box3 {
  const known = decalChunkBoundsByChunk.get(chunk);
  if (known) return known;
  const bounds = new THREE.Box3();
  if (chunk.triangleCount > 0) bounds.setFromArray(chunk.positions.subarray(0, chunk.triangleCount * 9));
  decalChunkBoundsByChunk.set(chunk, bounds);
  return bounds;
}
