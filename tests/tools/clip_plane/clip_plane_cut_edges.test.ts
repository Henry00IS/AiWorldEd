import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { collectClipCutEdgeSegments } from '@/tools/clip_plane/clip_plane_cut_edges.js';

/**
 * Creates a unit cube mesh centered at the origin.
 *
 * @returns Mesh with box geometry.
 */
function createUnitBoxMesh(): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
  mesh.updateMatrixWorld(true);
  return mesh;
}

/**
 * Counts unique undirected segments after position quantization.
 *
 * @param endpoints Interleaved segment endpoints.
 * @returns Number of unique segments.
 */
function countUniqueSegments(endpoints: THREE.Vector3[]): number {
  const keys = new Set<string>();
  for (let i = 0; i + 1 < endpoints.length; i += 2) {
    const a = quantize(endpoints[i]!);
    const b = quantize(endpoints[i + 1]!);
    keys.add(a < b ? `${a}|${b}` : `${b}|${a}`);
  }
  return keys.size;
}

/**
 * Quantizes a point for segment dedupe keys.
 *
 * @param point World point.
 * @returns Stable key string.
 */
function quantize(point: THREE.Vector3): string {
  const scale = 1000;
  return `${Math.round(point.x * scale)},${Math.round(point.y * scale)},${Math.round(point.z * scale)}`;
}

describe('collectClipCutEdgeSegments', () => {
  it('should return an empty list when no meshes are provided', () => {
    const plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
    expect(collectClipCutEdgeSegments(plane, [])).toEqual([]);
  });

  it('should cut a unit box with a mid plane into a closed silhouette loop', () => {
    const mesh = createUnitBoxMesh();
    const plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
    const segments = collectClipCutEdgeSegments(plane, [mesh]);
    expect(segments.length).toBeGreaterThanOrEqual(8);
    expect(segments.length % 2).toBe(0);
    // Triangulated faces may split each polygon edge into multiple collinear pieces.
    expect(countUniqueSegments(segments)).toBeGreaterThanOrEqual(4);
    segments.forEach((point) => {
      expect(Math.abs(plane.distanceToPoint(point))).toBeLessThan(1e-4);
      expect(Math.abs(point.x)).toBeLessThan(1e-4);
    });
  });

  it('should return no segments when the plane misses the mesh bounds', () => {
    const mesh = createUnitBoxMesh();
    const plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), -10);
    const segments = collectClipCutEdgeSegments(plane, [mesh]);
    expect(segments).toHaveLength(0);
  });

  it('should only process supplied targets and ignore distant extra meshes', () => {
    const near = createUnitBoxMesh();
    const far = createUnitBoxMesh();
    far.position.set(50, 0, 0);
    far.updateMatrixWorld(true);
    const plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
    const onlyNear = collectClipCutEdgeSegments(plane, [near]);
    const both = collectClipCutEdgeSegments(plane, [near, far]);
    expect(onlyNear.length).toBeGreaterThan(0);
    expect(both.length).toBe(onlyNear.length);
  });

  it('should return cut segments for many small selected boxes', () => {
    const meshes: THREE.Mesh[] = [];
    for (let i = 0; i < 200; i++) {
      const mesh = createUnitBoxMesh();
      mesh.position.set((i % 20) * 3, 0, Math.floor(i / 20) * 3);
      mesh.updateMatrixWorld(true);
      meshes.push(mesh);
    }
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.25);
    const segments = collectClipCutEdgeSegments(plane, meshes);
    expect(segments.length).toBeGreaterThan(0);
  });
});
