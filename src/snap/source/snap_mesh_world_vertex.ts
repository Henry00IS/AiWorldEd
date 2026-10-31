import * as THREE from 'three';

/**
 * Reads one mesh vertex in world space.
 *
 * @param mesh Mesh that owns the vertex.
 * @param index Position-attribute index.
 * @param target Vector to fill.
 * @returns True when the index exists.
 */
export function readMeshWorldVertex(mesh: THREE.Mesh, index: number, target: THREE.Vector3): boolean {
  const positions = mesh.geometry.getAttribute('position');
  if (!positions || index < 0 || index >= positions.count) {
    return false;
  }
  target.fromBufferAttribute(positions, index);
  target.applyMatrix4(mesh.matrixWorld);
  return true;
}

/**
 * Returns the position count of a mesh.
 *
 * @param mesh Mesh to measure.
 * @returns Vertex count, or 0 when the mesh has no positions.
 */
export function meshVertexCount(mesh: THREE.Mesh): number {
  const positions = mesh.geometry.getAttribute('position');
  if (!positions) {
    return 0;
  }
  return positions.count;
}
