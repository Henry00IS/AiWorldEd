import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';
import {
  applyUvMoveToMatrix,
  computeWorldDeltaBetweenPoints,
} from '@/texture/interactive/math/uv_transform_move_math.js';

describe('uv_transform_move_math', () => {
  it('keeps UV at the start point when projecting the moved world point', () => {
    const baseline = SurfaceUvMatrix.identity();
    const start = new THREE.Vector3(1, 0, 2);
    const current = new THREE.Vector3(1.5, 0, 2.25);
    const delta = computeWorldDeltaBetweenPoints(start, current);
    const moved = applyUvMoveToMatrix(baseline, delta);
    const uvAtStart = baseline.project(start);
    const uvAtCurrent = moved.project(current);
    expect(uvAtCurrent.u).toBeCloseTo(uvAtStart.u, 6);
    expect(uvAtCurrent.v).toBeCloseTo(uvAtStart.v, 6);
  });

  it('computes delta as current minus start', () => {
    const start = new THREE.Vector3(0, 1, 0);
    const current = new THREE.Vector3(2, 1, -3);
    const delta = computeWorldDeltaBetweenPoints(start, current);
    expect(delta.x).toBeCloseTo(2, 6);
    expect(delta.y).toBeCloseTo(0, 6);
    expect(delta.z).toBeCloseTo(-3, 6);
  });
});
