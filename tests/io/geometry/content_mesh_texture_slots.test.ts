import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { contentMeshImportCreate } from '@/io/geometry/content_mesh_import.js';
import { contentMeshImportFinalizeSlots } from '@/io/geometry/content_mesh_texture_slots.js';
import { createMeshDocumentBox } from '@/mesh/primitive/mesh_primitive_box.js';
import { getFaceTextureMaps } from '@/texture/uv/face_texture_storage.js';

/**
 * Builds a box content mesh finished with texture slots.
 *
 * @param textures Slot textures.
 * @param slots Slot of each face.
 * @returns Finished mesh.
 */
function boxWith(textures: (string | null)[], slots: number[]): THREE.Mesh {
  const mesh = contentMeshImportCreate(createMeshDocumentBox(1, 1, 1), 'Box', 'isTestMesh');
  contentMeshImportFinalizeSlots(mesh, false, { textures, slots });
  return mesh;
}

describe('content mesh texture slots', () => {
  it('paints the faces of each slot with its texture, two triangles per box face', () => {
    const maps = getFaceTextureMaps(boxWith(['stone', 'grass'], [0, 0, 1, 0, 0, 0]));
    expect(maps.map((entry) => entry.mapping.textureId)).toEqual(['stone', 'grass']);
    expect(maps[1]?.triangleIndices).toHaveLength(2);
    expect(maps[0]?.triangleIndices).toHaveLength(10);
  });

  it('keeps one slot as one whole-mesh texture', () => {
    const maps = getFaceTextureMaps(boxWith(['stone'], [0, 0, 0, 0, 0, 0]));
    expect(new Set(maps.map((entry) => entry.mapping.textureId))).toEqual(new Set(['stone']));
  });
});
