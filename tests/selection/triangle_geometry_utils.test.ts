import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  findCoplanarFaceIndices,
  getTriangleCount,
  getTriangleVertexIndices,
  computeTriangleNormal
} from '../../src/selection/triangle_geometry_utils.js';

describe('triangle_geometry_utils', () => {
  it('should report 12 triangles for a BoxGeometry', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    expect(getTriangleCount(geometry)).toBe(12);
  });

  it('should resolve indexed triangle vertex indices for a box face', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const [i0, i1, i2] = getTriangleVertexIndices(geometry, 0);
    expect(i0).toBeGreaterThanOrEqual(0);
    expect(i1).toBeGreaterThanOrEqual(0);
    expect(i2).toBeGreaterThanOrEqual(0);
    expect(i0).not.toBe(i1);
  });

  it('should expand a box triangle to a full coplanar face of two triangles', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const coplanar = findCoplanarFaceIndices(geometry, 0);
    expect(coplanar.length).toBe(2);
    expect(coplanar).toContain(0);
  });

  it('should produce matching normals for both coplanar box face triangles', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const coplanar = findCoplanarFaceIndices(geometry, 0);
    const n0 = computeTriangleNormal(geometry, coplanar[0]);
    const n1 = computeTriangleNormal(geometry, coplanar[1]);
    expect(Math.abs(n0.dot(n1))).toBeCloseTo(1, 4);
  });

  it('should keep non-coplanar triangles separate on a box', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const faceA = findCoplanarFaceIndices(geometry, 0);
    const faceB = findCoplanarFaceIndices(geometry, 4);
    const overlap = faceA.filter((index) => faceB.includes(index));
    expect(overlap.length).toBe(0);
  });
});
