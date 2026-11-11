import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';
import {
  faceTextureMappingToSurface,
  surfaceToFaceTextureMapping,
} from '@/texture/uv_matrix/legacy_mapping_migrate.js';
import { createDefaultFaceTextureMapping, createFaceTextureMappingFromTrs } from '@/texture/uv/face_texture_mapping.js';
import { projectWorldPositionToUv, resolveProjectionBasis } from '@/texture/uv/planar_uv_projector.js';
import { transformBrushLocalUvForPoseChange } from '@/texture/uv_matrix/surface_uv_matrix_transform.js';
import { buildLocalToPlaneMatrix } from '@/texture/uv_matrix/plane_space_matrix.js';

describe('SurfaceUvMatrix', () => {
  it('identity projects world X to U and Y to V', () => {
    const matrix = SurfaceUvMatrix.identity();
    const uv = matrix.project(new THREE.Vector3(2, 3, 4));
    expect(uv.u).toBeCloseTo(2, 6);
    expect(uv.v).toBeCloseTo(3, 6);
  });

  it('centered projects with a half-tile UV phase so unit faces cover one tile', () => {
    const matrix = SurfaceUvMatrix.centered();
    const atOrigin = matrix.project(new THREE.Vector3(0, 0, 0));
    expect(atOrigin.u).toBeCloseTo(0.5, 6);
    expect(atOrigin.v).toBeCloseTo(0.5, 6);
    const atCorner = matrix.project(new THREE.Vector3(-0.5, -0.5, 0));
    expect(atCorner.u).toBeCloseTo(0, 6);
    expect(atCorner.v).toBeCloseTo(0, 6);
  });

  it('default face mapping and surface use the centered UV matrix', () => {
    const mapping = createDefaultFaceTextureMapping('checker');
    expect(mapping.uv.u.w).toBeCloseTo(0.5, 6);
    expect(mapping.uv.v.w).toBeCloseTo(0.5, 6);
    const surface = faceTextureMappingToSurface(mapping, new THREE.Vector3(0, 1, 0));
    expect(surface.uv.u.w).toBeCloseTo(0.5, 6);
    expect(surface.uv.v.w).toBeCloseTo(0.5, 6);
  });

  it('round-trips TRS decompose for a horizontal face', () => {
    const normal = new THREE.Vector3(0, 1, 0);
    const translation = new THREE.Vector2(0.25, -0.5);
    const built = SurfaceUvMatrix.fromTrs(translation, normal, 30, 2, 0.5);
    const trs = built.decompose(normal);
    expect(trs.rotationDeg).toBeCloseTo(30, 2);
    expect(Math.abs(trs.scaleU)).toBeCloseTo(2, 3);
    expect(Math.abs(trs.scaleV)).toBeCloseTo(0.5, 3);
    expect(trs.translation.x).toBeCloseTo(0.25, 3);
    expect(trs.translation.y).toBeCloseTo(-0.5, 3);
  });

  it('preserves negative scale signs for UV mirroring on decompose', () => {
    const normal = new THREE.Vector3(0, 1, 0);
    const built = SurfaceUvMatrix.fromTrs(new THREE.Vector2(0, 0), normal, 0, -2, 0.5);
    const trs = built.decompose(normal);
    expect(trs.scaleU).toBeCloseTo(-2, 3);
    expect(trs.scaleV).toBeCloseTo(0.5, 3);
    const rebuilt = SurfaceUvMatrix.fromTrs(trs.translation, normal, trs.rotationDeg, trs.scaleU, trs.scaleV);
    expect(rebuilt.equals(built, 1e-4)).toBe(true);
  });

  it('matches FaceTextureMapping projection for TRS-built mapping', () => {
    const normal = new THREE.Vector3(0, 0, 1);
    const mapping = createFaceTextureMappingFromTrs(
      'checker',
      normal,
      { scaleU: 2, scaleV: 4, offsetU: 0.5, offsetV: -1, rotationDeg: 0 },
      'face',
    );
    const surface = faceTextureMappingToSurface(mapping, normal);
    const sample = new THREE.Vector3(1.5, -2, 0);
    const basis = resolveProjectionBasis(normal, mapping);
    const projected = projectWorldPositionToUv(sample, basis, mapping);
    const matrixUv = surface.uv.project(sample);
    expect(matrixUv.u).toBeCloseTo(projected.u, 5);
    expect(matrixUv.v).toBeCloseTo(projected.v, 5);
  });

  it('serializes and deserializes rows', () => {
    const original = SurfaceUvMatrix.fromTrs(new THREE.Vector2(0.1, 0.2), new THREE.Vector3(1, 0, 0), 15, 1.5, 2.5);
    const restored = SurfaceUvMatrix.fromSerialized(original.serialize());
    expect(restored.equals(original, 1e-6)).toBe(true);
  });

  it('resets non-finite rows to identity', () => {
    const bad = new SurfaceUvMatrix(new THREE.Vector4(Number.NaN, 0, 0, 0), new THREE.Vector4(0, 1, 0, 0));
    expect(bad.u.x).toBe(1);
    expect(bad.v.y).toBe(1);
  });
});

describe('plane space matrix', () => {
  it('maps a point on the plane to z ≈ 0', () => {
    const normal = new THREE.Vector3(0, 1, 0);
    const offset = -3;
    const localToPlane = buildLocalToPlaneMatrix(normal, offset);
    const point = new THREE.Vector3(1, 3, 2);
    const planePoint = point.clone().applyMatrix4(localToPlane);
    expect(planePoint.z).toBeCloseTo(0, 5);
  });
});

describe('brush-local UV lock transform', () => {
  it('keeps brush-local UV unchanged when both locks are on', () => {
    const normal = new THREE.Vector3(0, 0, 1);
    const uv = SurfaceUvMatrix.fromTrs(new THREE.Vector2(0, 0), normal, 0, 1, 1);
    const prev = new THREE.Matrix4().makeTranslation(0, 0, 0);
    const next = new THREE.Matrix4().makeRotationY(Math.PI / 2);
    next.setPosition(2, 0, 0);
    const locked = transformBrushLocalUvForPoseChange(uv, normal, 0, prev, next, {
      positionLock: true,
      stretchLock: true,
    });
    expect(locked.equals(uv, 1e-6)).toBe(true);
  });

  it('preserves world UV at a fixed world point when position lock is off', () => {
    const normal = new THREE.Vector3(0, 1, 0);
    const uv = SurfaceUvMatrix.fromTrs(new THREE.Vector2(0, 0), normal, 0, 1, 1);
    const localPoint = new THREE.Vector3(1, 0, 2);
    const prev = new THREE.Matrix4().identity();
    const next = new THREE.Matrix4().makeTranslation(5, 0, 0);
    const worldPoint = localPoint.clone().applyMatrix4(prev);
    const prevWorldUv = uv.project(localPoint);
    const nextLocal = worldPoint.clone().applyMatrix4(next.clone().invert());
    const updated = transformBrushLocalUvForPoseChange(uv, normal, 0, prev, next, {
      positionLock: false,
      stretchLock: true,
    });
    const nextUv = updated.project(nextLocal);
    expect(nextUv.u).toBeCloseTo(prevWorldUv.u, 4);
    expect(nextUv.v).toBeCloseTo(prevWorldUv.v, 4);
  });

  it('reveals more tiles from free side when stretch lock is off on face-pivot scale', () => {
    // Pull +X face: scale 2x on X and shift center so -X face stays fixed.
    const normal = new THREE.Vector3(0, 1, 0);
    const uv = SurfaceUvMatrix.fromTrs(new THREE.Vector2(0, 0), normal, 0, 1, 1);
    const prev = new THREE.Matrix4().identity();
    const next = new THREE.Matrix4().makeScale(2, 1, 1);
    next.setPosition(0.5, 0, 0);
    const fixedLocal = new THREE.Vector3(-0.5, 0, 0);
    const freeLocal = new THREE.Vector3(0.5, 0, 0);
    const fixedWorld = fixedLocal.clone().applyMatrix4(prev);
    const freeWorld = freeLocal.clone().applyMatrix4(prev);
    const uvFixedBefore = uv.project(fixedLocal);
    const uvFreeBefore = uv.project(freeLocal);
    const updated = transformBrushLocalUvForPoseChange(uv, normal, 0, prev, next, {
      positionLock: true,
      stretchLock: false,
    });
    const fixedLocalAfter = fixedWorld.clone().applyMatrix4(next.clone().invert());
    const freeLocalAfter = freeWorld.clone().applyMatrix4(next.clone().invert());
    const newFreeLocal = new THREE.Vector3(0.5, 0, 0);
    expect(updated.project(fixedLocalAfter).u).toBeCloseTo(uvFixedBefore.u, 4);
    expect(updated.project(freeLocalAfter).u).toBeCloseTo(uvFreeBefore.u, 4);
    // New material on the grown free side has a different UV than the old free edge.
    expect(Math.abs(updated.project(newFreeLocal).u - uvFreeBefore.u)).toBeGreaterThan(0.4);
  });

  it('keeps UV matrix unchanged on face-pivot scale when only stretch lock is on', () => {
    const normal = new THREE.Vector3(0, 1, 0);
    const uv = SurfaceUvMatrix.fromTrs(new THREE.Vector2(0, 0), normal, 0, 1, 1);
    const prev = new THREE.Matrix4().identity();
    const next = new THREE.Matrix4().makeScale(2, 1, 1);
    next.setPosition(0.5, 0, 0);
    const locked = transformBrushLocalUvForPoseChange(uv, normal, 0, prev, next, {
      positionLock: false,
      stretchLock: true,
    });
    expect(locked.equals(uv, 1e-6)).toBe(true);
  });

  it('round-trips surface to legacy mapping custom axes', () => {
    const normal = new THREE.Vector3(0, 0, 1);
    const surface = faceTextureMappingToSurface(createDefaultFaceTextureMapping('t'), normal);
    const legacy = surfaceToFaceTextureMapping(surface, normal);
    const again = faceTextureMappingToSurface(legacy, normal);
    const sample = new THREE.Vector3(0.7, -0.3, 0);
    const a = surface.uv.project(sample);
    const b = again.uv.project(sample);
    expect(b.u).toBeCloseTo(a.u, 4);
    expect(b.v).toBeCloseTo(a.v, 4);
  });

  it('multiplyMatrix4 gives exactly the first two rows of the full matrix product', () => {
    const uv = new SurfaceUvMatrix(new THREE.Vector4(0.3, -1.7, 0.01, 5.5), new THREE.Vector4(-0.2, 0.9, 2.5, -3.25));
    const transform = new THREE.Matrix4().compose(
      new THREE.Vector3(12.5, -3, 0.75),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0.7, -0.4, 1.9)),
      new THREE.Vector3(0.5, 3, 1.25),
    );
    const product = uv.multiplyMatrix4(transform);
    const expected = SurfaceUvMatrix.fromMatrix4(uv.toMatrix4().multiply(transform));
    expect(product.u.toArray()).toEqual(expected.u.toArray());
    expect(product.v.toArray()).toEqual(expected.v.toArray());
  });
});
