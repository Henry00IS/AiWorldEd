import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidPlane } from '@/solid/brush/solid_plane.js';
import { SolidBoundsOps } from '@/solid/algorithm/math/solid_bounds_ops.js';
import { SolidPlaneBounds } from '@/solid/algorithm/math/solid_plane_bounds.js';
import { SolidPlaneBoundsResult } from '@/solid/algorithm/math/solid_plane_bounds_result.js';

/**
 * Builds an AABB from min/max corners.
 *
 * @param minX Min x.
 * @param minY Min y.
 * @param minZ Min z.
 * @param maxX Max x.
 * @param maxY Max y.
 * @param maxZ Max z.
 * @returns Axis-aligned bounds.
 */
function makeBounds(
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
): { min: THREE.Vector3; max: THREE.Vector3 } {
  return {
    min: new THREE.Vector3(minX, minY, minZ),
    max: new THREE.Vector3(maxX, maxY, maxZ),
  };
}

/** Plane/bounds early-out helpers. */
describe('SolidPlaneBounds and SolidBoundsOps', () => {
  it('classifies bounds entirely outside a plane as Outside', () => {
    const plane = new SolidPlane(new THREE.Vector3(1, 0, 0), -10);
    const bounds = makeBounds(11, 0, 0, 12, 1, 1);
    expect(SolidPlaneBounds.classify(plane, bounds)).toBe(SolidPlaneBoundsResult.Outside);
    expect(SolidPlaneBounds.isOutside(plane, bounds)).toBe(true);
    expect(SolidPlaneBounds.isInside(plane, bounds)).toBe(false);
  });

  it('classifies bounds entirely inside a plane as Inside', () => {
    const plane = new SolidPlane(new THREE.Vector3(1, 0, 0), -10);
    const bounds = makeBounds(0, 0, 0, 1, 1, 1);
    expect(SolidPlaneBounds.classify(plane, bounds)).toBe(SolidPlaneBoundsResult.Inside);
    expect(SolidPlaneBounds.isInside(plane, bounds)).toBe(true);
    expect(SolidPlaneBounds.isOutside(plane, bounds)).toBe(false);
  });

  it('classifies straddling bounds as Intersecting', () => {
    const plane = new SolidPlane(new THREE.Vector3(1, 0, 0), 0);
    const bounds = makeBounds(-1, 0, 0, 1, 1, 1);
    expect(SolidPlaneBounds.classify(plane, bounds)).toBe(SolidPlaneBoundsResult.Intersecting);
  });

  it('intersects bounds with epsilon semantics', () => {
    const left = makeBounds(0, 0, 0, 1, 1, 1);
    const right = makeBounds(1.0005, 0, 0, 2, 1, 1);
    expect(SolidBoundsOps.intersects(left, right, 0.001)).toBe(true);
    expect(SolidBoundsOps.intersects(left, right, 0.0001)).toBe(false);
  });

  it('rejects degenerate or non-finite bounds', () => {
    expect(SolidBoundsOps.isValid({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 1 })).toBe(false);
    expect(SolidBoundsOps.isValid({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 })).toBe(true);
  });
});
