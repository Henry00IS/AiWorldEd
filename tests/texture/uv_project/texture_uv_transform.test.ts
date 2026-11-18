import { describe, expect, it } from 'vitest';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';
import * as THREE from 'three';
import { textureUvTransformMatrix, textureUvTransformPoint } from '@/texture/uv_project/texture_uv_transform.js';

const identity = (): SurfaceUvMatrix => SurfaceUvMatrix.identity();

const none = {
  offsetU: 0,
  offsetV: 0,
  scaleU: 1,
  scaleV: 1,
  rotationDeg: 0,
  pivotU: 0,
  pivotV: 0,
};

describe('textureUvTransform', () => {
  it('offsets, scales and rotates a UV point about the pivot', () => {
    expect(textureUvTransformPoint([1, 0], { ...none, offsetU: 0.25, offsetV: -0.5 })).toEqual([1.25, -0.5]);
    expect(textureUvTransformPoint([2, 3], { ...none, scaleU: 2, scaleV: 0.5 })).toEqual([4, 1.5]);
    const turned = textureUvTransformPoint([1, 0], { ...none, rotationDeg: 90, pivotU: 0, pivotV: 0 });
    expect(Math.round(turned[0] * 1e6) / 1e6).toBe(0);
    expect(Math.round(turned[1] * 1e6) / 1e6).toBe(1);
  });

  it('applies the same map to a matrix as to a projected point', () => {
    const transform = { ...none, offsetU: 0.1, offsetV: 0.2, scaleU: 2, rotationDeg: 90, pivotU: 0.5, pivotV: 0.5 };
    const point = new THREE.Vector3(1, 2, 0);
    const before = identity().project(point);
    const moved = textureUvTransformPoint([before.u, before.v], transform);
    const after = textureUvTransformMatrix(identity(), transform).project(point);
    expect(Math.round(after.u * 1e6) / 1e6).toBe(Math.round(moved[0] * 1e6) / 1e6);
    expect(Math.round(after.v * 1e6) / 1e6).toBe(Math.round(moved[1] * 1e6) / 1e6);
  });
});
