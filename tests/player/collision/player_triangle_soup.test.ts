import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PlayerTriangleSoup } from '@/player/collision/player_triangle_soup.js';

/**
 * Builds a box mesh at the given world center with the given size.
 *
 * @param center World center.
 * @param size Box size.
 * @returns Mesh ready for collision.
 */
function createBoxMesh(center: THREE.Vector3, size: THREE.Vector3): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z));
  mesh.position.copy(center);
  mesh.updateMatrixWorld(true);
  return mesh;
}

describe('PlayerTriangleSoup', () => {
  it('bakes triangles from a mesh and reports a positive count', () => {
    const soup = new PlayerTriangleSoup();
    soup.bakeMesh(createBoxMesh(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1)));
    expect(soup.getTriangleCount()).toBeGreaterThan(0);
  });

  it('returns nearby triangles for an AABB query and ignores far cells', () => {
    const soup = new PlayerTriangleSoup();
    soup.bakeMesh(createBoxMesh(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1)));
    soup.bakeMesh(createBoxMesh(new THREE.Vector3(40, 0, 40), new THREE.Vector3(1, 1, 1)));
    const near = new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
    const indices: number[] = [];
    soup.queryAabb(near, indices);
    expect(indices.length).toBeGreaterThan(0);
    expect(indices.length).toBeLessThan(soup.getTriangleCount());
  });

  it('clears all baked data', () => {
    const soup = new PlayerTriangleSoup();
    soup.bakeMesh(createBoxMesh(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1)));
    soup.clear();
    expect(soup.getTriangleCount()).toBe(0);
  });
});
