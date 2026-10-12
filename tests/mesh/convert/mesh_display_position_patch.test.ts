import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createMeshDocumentBox } from '@/mesh/primitive/mesh_primitive_box.js';
import { writeMeshDocumentDisplayGeometry } from '@/mesh/convert/mesh_document_display_write.js';
import { tryPatchMeshDocumentDisplayPositions } from '@/mesh/convert/mesh_display_position_patch.js';
import { DECORATIVE_EDGE_USERDATA_KEY } from '@/utils/mesh_edge_sync.js';

describe('mesh display position patch', () => {
  it('moves only the edited vertex corners and keeps the display geometry', () => {
    const document = createMeshDocumentBox(2, 2, 2);
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial());
    writeMeshDocumentDisplayGeometry(mesh, document);
    const geometry = mesh.geometry;
    const uvBefore = geometry.getAttribute('uv').array.slice(0);
    moveDocumentVertex(document, 0, 5, 6, 7);
    expect(tryPatchMeshDocumentDisplayPositions(mesh, document)).toBe(true);
    expect(mesh.geometry).toBe(geometry);
    expect(readPosition(geometry, 0)).toEqual([5, 6, 7]);
    expect(arraysAlmostEqual(geometry.getAttribute('uv').array, uvBefore)).toBe(true);
    expect(someCornerIsNot(geometry, [5, 6, 7])).toBe(true);
    const outline = mesh.children.find((child) => child.userData[DECORATIVE_EDGE_USERDATA_KEY] === true);
    expect(outline).toBeInstanceOf(THREE.LineSegments);
    if (outline instanceof THREE.LineSegments) {
      expect(outlinePositionIncludes(outline.geometry, 5, 6, 7)).toBe(true);
    }
    geometry.dispose();
  });
});

/**
 * Reads the first display corner.
 *
 * @param geometry Display geometry.
 * @param vertexIndex Attribute index.
 * @returns XYZ.
 */
function readPosition(geometry: THREE.BufferGeometry, vertexIndex: number): number[] {
  const position = geometry.getAttribute('position');
  return [position.getX(vertexIndex), position.getY(vertexIndex), position.getZ(vertexIndex)];
}

/**
 * Writes one document vertex and marks positions dirty.
 *
 * @param document Mesh document.
 * @param vertexIndex Vertex index.
 * @param x New X.
 * @param y New Y.
 * @param z New Z.
 */
function moveDocumentVertex(
  document: ReturnType<typeof createMeshDocumentBox>,
  vertexIndex: number,
  x: number,
  y: number,
  z: number,
): void {
  const positions = document.getTopology().getPositions();
  const base = vertexIndex * 3;
  positions[base] = x;
  positions[base + 1] = y;
  positions[base + 2] = z;
  document.markPositionsDirty();
}

/**
 * Returns whether some display corner is not the given position.
 *
 * @param geometry Display geometry.
 * @param target Position to exclude.
 * @returns True when another corner remains.
 */
function someCornerIsNot(geometry: THREE.BufferGeometry, target: number[]): boolean {
  const position = geometry.getAttribute('position');
  for (let index = 0; index < position.count; index++) {
    const same =
      position.getX(index) === target[0] && position.getY(index) === target[1] && position.getZ(index) === target[2];
    if (!same) {
      return true;
    }
  }
  return false;
}

/**
 * Returns whether two numeric arrays match closely.
 *
 * @param left Left values.
 * @param right Right values.
 * @returns True when every pair is near.
 */
function arraysAlmostEqual(left: ArrayLike<number>, right: ArrayLike<number>): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index++) {
    if (Math.abs((left[index] ?? 0) - (right[index] ?? 0)) > 1e-6) {
      return false;
    }
  }
  return true;
}

/**
 * Returns whether an outline buffer contains a point.
 *
 * @param geometry Outline geometry.
 * @param x X.
 * @param y Y.
 * @param z Z.
 * @returns True when a point matches.
 */
function outlinePositionIncludes(geometry: THREE.BufferGeometry, x: number, y: number, z: number): boolean {
  const position = geometry.getAttribute('position');
  for (let index = 0; index < position.count; index++) {
    if (
      Math.abs(position.getX(index) - x) < 1e-5 &&
      Math.abs(position.getY(index) - y) < 1e-5 &&
      Math.abs(position.getZ(index) - z) < 1e-5
    ) {
      return true;
    }
  }
  return false;
}
