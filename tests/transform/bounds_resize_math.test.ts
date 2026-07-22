import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  computeOneSidedMeshResize,
  getFixedFaceWorldCenter,
  snapBoundsFaceDelta,
  MIN_BOUNDS_HALF_EXTENT
} from '../../src/transform/bounds_resize_math.js';
import { OrientedBoundsData } from '../../src/transform/oriented_bounds.js';
import { BoundsFace } from '../../src/types/bounds_face.js';

describe('bounds_resize_math', () => {
  it('should keep the opposite face fixed when expanding +X', () => {
    const bounds = createUnitBounds();
    const startPos = new THREE.Vector3(0, 0, 0);
    const startScale = new THREE.Vector3(1, 1, 1);
    const fixedBefore = getFixedFaceWorldCenter(bounds, BoundsFace.POS_X);
    const result = computeOneSidedMeshResize(
      startPos,
      startScale,
      bounds,
      BoundsFace.POS_X,
      2
    );
    const newBounds: OrientedBoundsData = {
      center: result.position.clone(),
      quaternion: bounds.quaternion.clone(),
      halfExtents: new THREE.Vector3(
        bounds.halfExtents.x * (result.scale.x / startScale.x),
        bounds.halfExtents.y,
        bounds.halfExtents.z
      )
    };
    const fixedAfter = getFixedFaceWorldCenter(newBounds, BoundsFace.POS_X);
    expect(fixedAfter.distanceTo(fixedBefore)).toBeLessThan(1e-6);
    expect(result.scale.x).toBeGreaterThan(startScale.x);
    expect(result.position.x).toBeGreaterThan(startPos.x);
  });

  it('should not shrink below the minimum half extent', () => {
    const bounds = createUnitBounds();
    const result = computeOneSidedMeshResize(
      new THREE.Vector3(),
      new THREE.Vector3(1, 1, 1),
      bounds,
      BoundsFace.POS_Y,
      -100
    );
    const newHalf = bounds.halfExtents.y * result.scale.y;
    expect(newHalf).toBeGreaterThanOrEqual(MIN_BOUNDS_HALF_EXTENT - 1e-6);
  });

  it('should snap face deltas to the grid interval', () => {
    expect(snapBoundsFaceDelta(1.4, true, 1)).toBe(1);
    expect(snapBoundsFaceDelta(1.4, false, 1)).toBeCloseTo(1.4, 5);
  });

  it('should snap faces onto absolute grid coordinates from an off-grid start', () => {
    const startFace = 3.625;
    const rawDelta = 0.1;
    const snapped = snapBoundsFaceDelta(rawDelta, true, 0.25, startFace);
    expect(startFace + snapped).toBeCloseTo(3.75, 5);
  });

  it('should only change the scale component of the resized axis', () => {
    const bounds = createUnitBounds();
    const result = computeOneSidedMeshResize(
      new THREE.Vector3(),
      new THREE.Vector3(1, 2, 3),
      bounds,
      BoundsFace.NEG_Z,
      1
    );
    expect(result.scale.x).toBeCloseTo(1, 5);
    expect(result.scale.y).toBeCloseTo(2, 5);
    expect(result.scale.z).not.toBeCloseTo(3, 5);
  });
});

/**
 * Creates identity-oriented unit half-extent bounds at the origin.
 * @returns Oriented bounds with halfExtents of 0.5 on each axis.
 */
function createUnitBounds(): OrientedBoundsData {
  return {
    center: new THREE.Vector3(0, 0, 0),
    quaternion: new THREE.Quaternion(),
    halfExtents: new THREE.Vector3(0.5, 0.5, 0.5)
  };
}
