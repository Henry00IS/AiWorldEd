import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { meshDocumentFromBufferGeometryWelded, weldTriangleMesh } from '@/edit/mesh/mesh_edit_weld.js';
import { meshDocumentToBufferGeometry } from '@/mesh/convert/mesh_to_buffer_geometry.js';
import { TerrainGenerator } from '@/terrain/terrain_generator.js';

describe('mesh_edit_weld', () => {
  it('welds coincident vertices in a triangle mesh', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 1, 0]);
    const indices = [0, 1, 2, 3, 4, 5];
    const welded = weldTriangleMesh(positions, indices, 1e-5);
    expect(welded.positions.length / 3).toBeLessThan(6);
    expect(welded.triangleIndices).toHaveLength(6);
  });

  it('builds a welded MeshDocument from a box BufferGeometry as triangle faces', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const document = meshDocumentFromBufferGeometryWelded(geometry);
    expect(document.getTopology().getVertexCount()).toBe(8);
    expect(document.getTopology().getFaceCount()).toBe(12);
    geometry.dispose();
  });

  it('does not merge sphere triangles into curved n-gons during weld recovery', () => {
    const geometry = new THREE.SphereGeometry(0.5, 16, 12);
    const index = geometry.getIndex();
    const position = geometry.getAttribute('position');
    const triangleCount = index ? index.count / 3 : position.count / 3;
    const document = meshDocumentFromBufferGeometryWelded(geometry);
    expect(document.getTopology().getFaceCount()).toBe(triangleCount);
    geometry.dispose();
  });

  it('preserves non-zero UVs through weld and buffer rebuild', () => {
    const geometry = new THREE.PlaneGeometry(4, 4, 2, 2);
    geometry.rotateX(-Math.PI / 2);
    const sourceUv = geometry.getAttribute('uv') as THREE.BufferAttribute;
    expect(sourceUv).toBeTruthy();
    const document = meshDocumentFromBufferGeometryWelded(geometry);
    const cornerUvs = document.getAttributes().getCornerUvs().getValues();
    const hasNonZeroCornerUv = Array.from(cornerUvs).some((value) => Math.abs(value) > 1e-6);
    expect(hasNonZeroCornerUv).toBe(true);
    const rebuilt = meshDocumentToBufferGeometry(document);
    const rebuiltUv = rebuilt.getAttribute('uv') as THREE.BufferAttribute;
    expect(rebuiltUv).toBeTruthy();
    let maxUvComponent = 0;
    for (let index = 0; index < rebuiltUv.count; index++) {
      maxUvComponent = Math.max(maxUvComponent, Math.abs(rebuiltUv.getX(index)), Math.abs(rebuiltUv.getY(index)));
    }
    expect(maxUvComponent).toBeGreaterThan(0.1);
    geometry.dispose();
    rebuilt.dispose();
  });

  it('preserves terrain UVs after weld and vertex move rebuild', () => {
    const terrain = new TerrainGenerator().createTerrain(10, 10, 4, 1.5, 11);
    const sourceUv = terrain.geometry.getAttribute('uv') as THREE.BufferAttribute;
    expect(sourceUv).toBeTruthy();
    const sourceUvSnapshot = snapshotUvAttribute(sourceUv);
    const document = meshDocumentFromBufferGeometryWelded(terrain.geometry);
    const positions = document.getTopology().getPositions();
    positions[1] = (positions[1] ?? 0) + 0.25;
    document.markPositionsDirty();
    const rebuilt = meshDocumentToBufferGeometry(document);
    const rebuiltUv = rebuilt.getAttribute('uv') as THREE.BufferAttribute;
    expect(rebuiltUv).toBeTruthy();
    expect(rebuiltUv.count).toBeGreaterThan(0);
    const rebuiltMax = maxAbsoluteUvComponent(rebuiltUv);
    const sourceMax = maxAbsoluteFromSnapshot(sourceUvSnapshot);
    expect(rebuiltMax).toBeGreaterThan(0.1);
    expect(rebuiltMax).toBeGreaterThanOrEqual(sourceMax * 0.25);
    terrain.geometry.dispose();
    rebuilt.dispose();
  });
});

/**
 * Copies all UV components into a plain number array.
 *
 * @param uv Source UV attribute.
 * @returns Flat u,v values.
 */
function snapshotUvAttribute(uv: THREE.BufferAttribute): number[] {
  const values: number[] = [];
  for (let index = 0; index < uv.count; index++) {
    values.push(uv.getX(index), uv.getY(index));
  }
  return values;
}

/**
 * Returns the largest absolute UV component on an attribute.
 *
 * @param uv UV attribute.
 * @returns Max absolute component.
 */
function maxAbsoluteUvComponent(uv: THREE.BufferAttribute): number {
  let maxValue = 0;
  for (let index = 0; index < uv.count; index++) {
    maxValue = Math.max(maxValue, Math.abs(uv.getX(index)), Math.abs(uv.getY(index)));
  }
  return maxValue;
}

/**
 * Returns the largest absolute UV component from a flat snapshot.
 *
 * @param values Flat u,v values.
 * @returns Max absolute component.
 */
function maxAbsoluteFromSnapshot(values: readonly number[]): number {
  let maxValue = 0;
  for (const value of values) {
    maxValue = Math.max(maxValue, Math.abs(value));
  }
  return maxValue;
}
