import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  physicsShatterTransformIdentity,
  physicsShatterTransformIsIdentity,
  physicsShatterTransformMatrix,
} from '@/modifier/stack/kinds/shatter/physics_shatter_transform.js';

describe('physicsShatterTransformMatrix', () => {
  it('applies x prime = R (x - c) + c + t', () => {
    const centroid = new THREE.Vector3(1, 2, 3);
    const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    const translation = new THREE.Vector3(0.5, -1, 2);
    const matrix = physicsShatterTransformMatrix({ rotation, translation }, centroid);
    const point = new THREE.Vector3(2, 2, 3);
    const expected = point.clone().sub(centroid).applyQuaternion(rotation).add(centroid).add(translation);
    expect(point.clone().applyMatrix4(matrix).distanceTo(expected)).toBeLessThan(1e-9);
    expect(centroid.clone().applyMatrix4(matrix).distanceTo(centroid.clone().add(translation))).toBeLessThan(1e-9);
    expect(physicsShatterTransformIsIdentity({ rotation, translation })).toBe(false);
  });

  it('leaves pieces in place for the identity', () => {
    const identity = physicsShatterTransformIdentity();
    expect(physicsShatterTransformIsIdentity(identity)).toBe(true);
    const matrix = physicsShatterTransformMatrix(identity, new THREE.Vector3(4, 5, 6));
    expect(matrix.equals(new THREE.Matrix4())).toBe(true);
  });
});
