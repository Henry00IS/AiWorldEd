import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';
import { surfaceUvApplyPolicy, surfaceUvFaceUEnds } from '@/texture/uv_matrix/surface_uv_policy.js';

/** A unit square in XY, at z = 0. */
const FACE = [
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(1, 1, 0),
  new THREE.Vector3(0, 1, 0),
];

describe('surfaceUvApplyPolicy', () => {
  it('adds UV shift tiles and flips U inside the face chart', () => {
    const uv = SurfaceUvMatrix.identity();
    expect(surfaceUvFaceUEnds(uv, FACE)).toBe(1);
    const shifted = surfaceUvApplyPolicy(uv, FACE, null, false, 2, -0.5);
    expect(shifted.u.w).toBe(2);
    expect(shifted.v.w).toBe(-0.5);
    const flipped = surfaceUvApplyPolicy(uv, FACE, null, true, 0, 0);
    // Identity U is X, so min+max U is 0+1; after flipping, U becomes -X + 1.
    expect(flipped.u.x).toBe(-1);
    expect(flipped.u.w).toBe(1);
    const at = FACE.map((point) => flipped.project(point).u).sort((left, right) => left - right);
    const original = FACE.map((point) => uv.project(point).u).sort((left, right) => left - right);
    expect((at[0] ?? 0) + (at[at.length - 1] ?? 0)).toBeCloseTo(
      (original[0] ?? 0) + (original[original.length - 1] ?? 0),
      8,
    );
  });

  it('applies a huge shift without losing the mapping direction', () => {
    const uv = SurfaceUvMatrix.identity();
    const shifted = surfaceUvApplyPolicy(uv, FACE, null, false, 1e6, -1e6);
    expect(shifted.u.x).toBe(1);
    expect(shifted.u.w).toBe(1e6);
    expect(shifted.v.w).toBe(-1e6);
  });
});
