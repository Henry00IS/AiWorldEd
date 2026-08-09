import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';
import {
  applyUvRotateToMatrix,
  measureSignedRotationDegrees,
} from '@/texture/interactive/math/uv_transform_rotate_math.js';

describe('uv_transform_rotate_math', () => {
  it('measures a 90 degree rotation about +Y', () => {
    const from = new THREE.Vector3(1, 0, 0);
    const to = new THREE.Vector3(0, 0, -1);
    const degrees = measureSignedRotationDegrees(from, to, new THREE.Vector3(0, 1, 0));
    expect(degrees).toBeCloseTo(90, 4);
  });

  it('preserves UV at pivot after rotation', () => {
    const baseline = SurfaceUvMatrix.identity();
    const pivot = new THREE.Vector3(2, 0, 3);
    const normal = new THREE.Vector3(0, 1, 0);
    const rotated = applyUvRotateToMatrix(baseline, pivot, normal, 45);
    const before = baseline.project(pivot);
    const after = rotated.project(pivot);
    expect(after.u).toBeCloseTo(before.u, 5);
    expect(after.v).toBeCloseTo(before.v, 5);
  });
});
