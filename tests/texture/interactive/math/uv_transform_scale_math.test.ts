import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';
import {
  applyUvScaleToMatrix,
  computeUniformScaleFactor,
  measureInPlaneRadius,
} from '@/texture/interactive/math/uv_transform_scale_math.js';

describe('uv_transform_scale_math', () => {
  it('computes scale factor from radii', () => {
    expect(computeUniformScaleFactor(2, 4)).toBeCloseTo(2, 6);
    expect(computeUniformScaleFactor(0, 5)).toBe(1);
  });

  it('measures in-plane radius ignoring normal component', () => {
    const pivot = new THREE.Vector3(0, 0, 0);
    const point = new THREE.Vector3(3, 10, 4);
    const radius = measureInPlaneRadius(point, pivot, new THREE.Vector3(0, 1, 0));
    expect(radius).toBeCloseTo(5, 6);
  });

  it('preserves UV at pivot after scale', () => {
    const baseline = SurfaceUvMatrix.identity();
    const pivot = new THREE.Vector3(1, 0, 1);
    const scaled = applyUvScaleToMatrix(baseline, pivot, 2);
    const before = baseline.project(pivot);
    const after = scaled.project(pivot);
    expect(after.u).toBeCloseTo(before.u, 5);
    expect(after.v).toBeCloseTo(before.v, 5);
  });
});
