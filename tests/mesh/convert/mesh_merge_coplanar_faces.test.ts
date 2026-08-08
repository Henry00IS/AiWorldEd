import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { meshDocumentFromBufferGeometryWelded } from '@/edit/mesh/mesh_edit_weld.js';
import { mergeCoplanarMeshDocumentFaces } from '@/mesh/convert/mesh_merge_coplanar_faces.js';
import { createMeshDocumentBox } from '@/mesh/primitive/mesh_primitive_box.js';
import { meshTopologyFaceCornerCount } from '@/mesh/topology/mesh_topology_query.js';

/**
 * Collects corner counts for every face in a document.
 *
 * @param document Mesh document.
 * @returns Corner counts per face.
 */
function faceCornerCounts(document: {
  getTopology: () => import('@/mesh/topology/mesh_topology.js').MeshTopology;
}): number[] {
  const topology = document.getTopology();
  const counts: number[] = [];
  for (let faceIndex = 0; faceIndex < topology.getFaceCount(); faceIndex++) {
    counts.push(meshTopologyFaceCornerCount(topology, faceIndex));
  }
  return counts;
}

describe('mergeCoplanarMeshDocumentFaces', () => {
  it('leaves welded BoxGeometry as triangle faces until merge is applied', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const document = meshDocumentFromBufferGeometryWelded(geometry);
    expect(document.getTopology().getVertexCount()).toBe(8);
    expect(document.getTopology().getFaceCount()).toBe(12);
    expect(faceCornerCounts(document).every((count) => count === 3)).toBe(true);
    geometry.dispose();
  });

  it('leaves authored box n-gons unchanged', () => {
    const box = createMeshDocumentBox(1, 1, 1);
    const merged = mergeCoplanarMeshDocumentFaces(box);
    expect(merged.getTopology().getFaceCount()).toBe(6);
    expect(faceCornerCounts(merged).every((count) => count === 4)).toBe(true);
  });

  it('can still merge welded box triangles into six quads when requested', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const triangles = meshDocumentFromBufferGeometryWelded(geometry);
    expect(triangles.getTopology().getFaceCount()).toBe(12);
    const merged = mergeCoplanarMeshDocumentFaces(triangles);
    expect(merged.getTopology().getFaceCount()).toBe(6);
    expect(faceCornerCounts(merged).every((count) => count === 4)).toBe(true);
    geometry.dispose();
  });
});
