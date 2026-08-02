import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildFbxMeshPayload } from '@/io/fbx/fbx_mesh_payload.js';

describe('buildFbxMeshPayload', () => {
  it('should preserve triangle winding and corner attributes by default', () => {
    const geometry = createAttributeTestGeometry();
    const payload = buildFbxMeshPayload(geometry, 1);

    expect(payload?.polygonVertexIndex).toEqual([0, 1, -3, 0, 2, -4]);
    expect(payload?.cornerNormals).toEqual([10, 0, 0, 20, 0, 0, 30, 0, 0, 10, 0, 0, 30, 0, 0, 40, 0, 0]);
    expect(payload?.cornerUvs).toEqual([0, 1, 1, 0.75, 0.5, 0.5, 0, 1, 0.5, 0.5, 0.25, 0]);
  });

  it('should reverse every triangle and keep corner attributes aligned', () => {
    const geometry = createAttributeTestGeometry();
    const payload = buildFbxMeshPayload(geometry, 1, true);

    expect(payload?.polygonVertexIndex).toEqual([0, 2, -2, 0, 3, -3]);
    expect(payload?.cornerNormals).toEqual([10, 0, 0, 30, 0, 0, 20, 0, 0, 10, 0, 0, 40, 0, 0, 30, 0, 0]);
    expect(payload?.cornerUvs).toEqual([0, 1, 0.5, 0.5, 1, 0.75, 0, 1, 0.25, 0, 0.5, 0.5]);
  });
});

/**
 * Creates indexed triangles with distinct per-vertex normals and UVs.
 *
 * @returns Geometry suitable for verifying triangle-corner ordering.
 */
function createAttributeTestGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([10, 0, 0, 20, 0, 0, 30, 0, 0, 40, 0, 0], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0.25, 0.5, 0.5, 0.25, 1], 2));
  return geometry;
}
