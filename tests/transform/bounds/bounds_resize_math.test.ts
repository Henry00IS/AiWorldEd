import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  computeOneSidedMeshResize,
  computeOneSidedMultiMeshResize,
  getFixedFaceWorldCenter,
  snapBoundsFaceDelta,
  resolveMinimumBoundsHalfExtent,
  MIN_BOUNDS_HALF_EXTENT_FREE,
  MIN_BOUNDS_WIDTH_FREE,
} from '@/transform/bounds/bounds_resize_math.js';
import { BuilderOrientedBounds, DataOrientedBounds } from '@/transform/bounds/builder_oriented_bounds.js';
import { BoundsFace } from '@/types/bounds_face.js';

describe('bounds_resize_math', () => {
  it('should keep the opposite face fixed when expanding +X', () => {
    const bounds = createUnitBounds();
    const startPos = new THREE.Vector3(0, 0, 0);
    const startScale = new THREE.Vector3(1, 1, 1);
    const fixedBefore = getFixedFaceWorldCenter(bounds, BoundsFace.POS_X);
    const result = computeOneSidedMeshResize(startPos, startScale, bounds, BoundsFace.POS_X, 2);
    const newBounds: DataOrientedBounds = {
      center: result.position.clone(),
      quaternion: bounds.quaternion.clone(),
      halfExtents: new THREE.Vector3(
        bounds.halfExtents.x * (result.scale.x / startScale.x),
        bounds.halfExtents.y,
        bounds.halfExtents.z,
      ),
    };
    const fixedAfter = getFixedFaceWorldCenter(newBounds, BoundsFace.POS_X);
    expect(fixedAfter.distanceTo(fixedBefore)).toBeLessThan(1e-6);
    expect(result.scale.x).toBeGreaterThan(startScale.x);
    expect(result.position.x).toBeGreaterThan(startPos.x);
  });

  it('should not shrink below the free minimum half extent without snap', () => {
    const bounds = createUnitBounds();
    const result = computeOneSidedMeshResize(
      new THREE.Vector3(),
      new THREE.Vector3(1, 1, 1),
      bounds,
      BoundsFace.POS_Y,
      -100,
      MIN_BOUNDS_HALF_EXTENT_FREE,
    );
    const newHalf = bounds.halfExtents.y * result.scale.y;
    expect(newHalf).toBeCloseTo(MIN_BOUNDS_HALF_EXTENT_FREE, 6);
    expect(newHalf * 2).toBeCloseTo(MIN_BOUNDS_WIDTH_FREE, 6);
  });

  it('should not shrink below half the grid interval when snap min is used', () => {
    const gridInterval = 0.25;
    const minHalf = resolveMinimumBoundsHalfExtent(true, gridInterval);
    expect(minHalf).toBeCloseTo(0.125, 6);
    const bounds = createUnitBounds();
    const result = computeOneSidedMeshResize(
      new THREE.Vector3(),
      new THREE.Vector3(1, 1, 1),
      bounds,
      BoundsFace.POS_X,
      -100,
      minHalf,
    );
    const newHalf = bounds.halfExtents.x * result.scale.x;
    expect(newHalf).toBeCloseTo(minHalf, 6);
    expect(newHalf * 2).toBeCloseTo(gridInterval, 6);
  });

  it('should resolve free minimum half extent to half of 0.03125', () => {
    expect(resolveMinimumBoundsHalfExtent(false, 0.25)).toBeCloseTo(MIN_BOUNDS_HALF_EXTENT_FREE, 10);
    expect(resolveMinimumBoundsHalfExtent(true, 0.125)).toBeCloseTo(0.0625, 10);
    expect(resolveMinimumBoundsHalfExtent(true, 0.03125)).toBeCloseTo(0.015625, 10);
  });

  it('should snap face deltas to the grid interval', () => {
    expect(snapBoundsFaceDelta(1.4, true, 1)).toBe(1);
    expect(snapBoundsFaceDelta(1.4, false, 1)).toBeCloseTo(1.4, 5);
  });

  it('should snap movement only so off-grid faces keep their offset', () => {
    const startFace = 3.625;
    const rawDelta = 0.1;
    const snapped = snapBoundsFaceDelta(rawDelta, true, 0.25);
    expect(snapped).toBeCloseTo(0, 5);
    expect(startFace + snapped).toBeCloseTo(3.625, 5);
    const larger = snapBoundsFaceDelta(0.3, true, 0.25);
    expect(larger).toBeCloseTo(0.25, 5);
    expect(startFace + larger).toBeCloseTo(3.875, 5);
  });

  it('should only change the scale component of the resized axis', () => {
    const bounds = createUnitBounds();
    const result = computeOneSidedMeshResize(
      new THREE.Vector3(),
      new THREE.Vector3(1, 2, 3),
      bounds,
      BoundsFace.NEG_Z,
      1,
    );
    expect(result.scale.x).toBeCloseTo(1, 5);
    expect(result.scale.y).toBeCloseTo(2, 5);
    expect(result.scale.z).not.toBeCloseTo(3, 5);
  });

  it('should keep the opposite face fixed when geometry is offset from the mesh origin', () => {
    const mesh = createOffsetBoxMesh();
    const builder = new BuilderOrientedBounds();
    const startBounds = builder.buildFromMeshes([mesh])!;
    const fixedBefore = getFixedFaceWorldCenter(startBounds, BoundsFace.POS_X);
    const faceTravel = startBounds.halfExtents.x;
    const result = computeOneSidedMeshResize(
      mesh.position.clone(),
      mesh.scale.clone(),
      startBounds,
      BoundsFace.POS_X,
      faceTravel,
    );
    mesh.position.copy(result.position);
    mesh.scale.copy(result.scale);
    mesh.updateMatrixWorld(true);
    const afterBounds = builder.buildFromMeshes([mesh])!;
    const fixedAfter = getFixedFaceWorldCenter(afterBounds, BoundsFace.POS_X);
    expect(fixedAfter.distanceTo(fixedBefore)).toBeLessThan(1e-5);
    expect(afterBounds.halfExtents.x).toBeGreaterThan(startBounds.halfExtents.x);
  });

  it('should keep the opposite face fixed when shrinking offset geometry on -X', () => {
    const mesh = createOffsetBoxMesh();
    const builder = new BuilderOrientedBounds();
    const startBounds = builder.buildFromMeshes([mesh])!;
    const fixedBefore = getFixedFaceWorldCenter(startBounds, BoundsFace.NEG_X);
    const shrink = -startBounds.halfExtents.x * 0.5;
    const result = computeOneSidedMeshResize(
      mesh.position.clone(),
      mesh.scale.clone(),
      startBounds,
      BoundsFace.NEG_X,
      shrink,
    );
    mesh.position.copy(result.position);
    mesh.scale.copy(result.scale);
    mesh.updateMatrixWorld(true);
    const afterBounds = builder.buildFromMeshes([mesh])!;
    const fixedAfter = getFixedFaceWorldCenter(afterBounds, BoundsFace.NEG_X);
    expect(fixedAfter.distanceTo(fixedBefore)).toBeLessThan(1e-5);
    expect(afterBounds.halfExtents.x).toBeLessThan(startBounds.halfExtents.x);
  });

  it('should keep the opposite face fixed for rotated offset geometry', () => {
    const mesh = createOffsetBoxMesh();
    mesh.rotation.y = Math.PI / 4;
    mesh.position.set(2, 1, -1);
    mesh.updateMatrixWorld(true);
    const builder = new BuilderOrientedBounds();
    const startBounds = builder.buildFromMeshes([mesh])!;
    const fixedBefore = getFixedFaceWorldCenter(startBounds, BoundsFace.POS_Z);
    const result = computeOneSidedMeshResize(
      mesh.position.clone(),
      mesh.scale.clone(),
      startBounds,
      BoundsFace.POS_Z,
      1.5,
    );
    mesh.position.copy(result.position);
    mesh.scale.copy(result.scale);
    mesh.updateMatrixWorld(true);
    const afterBounds = builder.buildFromMeshes([mesh])!;
    const fixedAfter = getFixedFaceWorldCenter(afterBounds, BoundsFace.POS_Z);
    expect(fixedAfter.distanceTo(fixedBefore)).toBeLessThan(1e-5);
  });

  it('should scale multi-mesh positions from the fixed opposite face plane', () => {
    const left = createCenteredBoxMesh(1);
    left.position.set(-2, 0, 0);
    const right = createCenteredBoxMesh(1);
    right.position.set(2, 0, 0);
    left.updateMatrixWorld(true);
    right.updateMatrixWorld(true);
    const builder = new BuilderOrientedBounds();
    const startBounds = builder.buildFromMeshes([left, right])!;
    const fixedBefore = getFixedFaceWorldCenter(startBounds, BoundsFace.POS_X);
    const faceTravel = 2;
    const leftResult = computeOneSidedMultiMeshResize(
      left.position.clone(),
      left.scale.clone(),
      startBounds,
      BoundsFace.POS_X,
      faceTravel,
    );
    const rightResult = computeOneSidedMultiMeshResize(
      right.position.clone(),
      right.scale.clone(),
      startBounds,
      BoundsFace.POS_X,
      faceTravel,
    );
    left.position.copy(leftResult.position);
    left.scale.copy(leftResult.scale);
    right.position.copy(rightResult.position);
    right.scale.copy(rightResult.scale);
    left.updateMatrixWorld(true);
    right.updateMatrixWorld(true);
    const afterBounds = builder.buildFromMeshes([left, right])!;
    const fixedAfter = getFixedFaceWorldCenter(afterBounds, BoundsFace.POS_X);
    expect(fixedAfter.distanceTo(fixedBefore)).toBeLessThan(1e-5);
    expect(afterBounds.halfExtents.x).toBeCloseTo(startBounds.halfExtents.x + faceTravel * 0.5, 5);
  });
});

/**
 * Creates identity-oriented unit half-extent bounds at the origin.
 *
 * @returns Oriented bounds with halfExtents of 0.5 on each axis.
 */
function createUnitBounds(): DataOrientedBounds {
  return {
    center: new THREE.Vector3(0, 0, 0),
    quaternion: new THREE.Quaternion(),
    halfExtents: new THREE.Vector3(0.5, 0.5, 0.5),
  };
}

/**
 * Creates a unit box whose geometry AABB is offset from the mesh origin, as
 * happens after clipping a solid brush without recentering local vertices.
 *
 * @returns Mesh with local AABB roughly [0,2] on X and centered on Y/Z.
 */
function createOffsetBoxMesh(): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(2, 2, 2);
  geometry.translate(1, 0, 0);
  geometry.computeBoundingBox();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  mesh.position.set(0, 0, 0);
  mesh.scale.set(1, 1, 1);
  mesh.updateMatrixWorld(true);
  return mesh;
}

/**
 * Creates an origin-centered box mesh of the given edge length.
 *
 * @param edgeLength Box edge length.
 * @returns Mesh with updated world matrix.
 */
function createCenteredBoxMesh(edgeLength: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(edgeLength, edgeLength, edgeLength), new THREE.MeshBasicMaterial());
  mesh.updateMatrixWorld(true);
  return mesh;
}
