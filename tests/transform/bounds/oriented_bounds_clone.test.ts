import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  cloneOrientedBounds,
  cloneOrientedBoundsOrNull,
  type DataOrientedBounds,
} from '@/transform/bounds/builder_oriented_bounds.js';

/**
 * Builds a sample oriented bounds for clone tests.
 *
 * @returns Fresh bounds data.
 */
function makeBounds(): DataOrientedBounds {
  return {
    center: new THREE.Vector3(1, 2, 3),
    quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.5),
    halfExtents: new THREE.Vector3(4, 5, 6),
  };
}

describe('cloneOrientedBounds', () => {
  it('returns independent vector and quaternion copies', () => {
    const source = makeBounds();
    const clone = cloneOrientedBounds(source);
    expect(clone.center).not.toBe(source.center);
    expect(clone.quaternion).not.toBe(source.quaternion);
    expect(clone.halfExtents).not.toBe(source.halfExtents);
    expect(clone.center.equals(source.center)).toBe(true);
    expect(clone.quaternion.equals(source.quaternion)).toBe(true);
    expect(clone.halfExtents.equals(source.halfExtents)).toBe(true);
    clone.center.x = 99;
    expect(source.center.x).toBe(1);
  });

  it('returns null when the source is null', () => {
    expect(cloneOrientedBoundsOrNull(null)).toBeNull();
    const source = makeBounds();
    const clone = cloneOrientedBoundsOrNull(source);
    expect(clone?.center.equals(source.center)).toBe(true);
  });
});
