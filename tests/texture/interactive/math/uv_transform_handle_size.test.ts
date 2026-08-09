import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  computeUvRadialDeadZoneRadius,
  estimateUvHandleWorldSize,
} from '@/texture/interactive/math/uv_transform_handle_size.js';

describe('uv_transform_handle_size', () => {
  it('grows perspective handle size with camera distance', () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 10, 0);
    camera.updateMatrixWorld(true);
    const nearPivot = new THREE.Vector3(0, 9, 0);
    const farPivot = new THREE.Vector3(0, 0, 0);
    const nearSize = estimateUvHandleWorldSize(camera, nearPivot);
    const farSize = estimateUvHandleWorldSize(camera, farPivot);
    expect(farSize).toBeGreaterThan(nearSize);
    expect(nearSize).toBeGreaterThan(0);
  });

  it('sizes orthographic dead zone from frustum height', () => {
    const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 1000);
    const pivot = new THREE.Vector3(0, 0, 0);
    const deadZone = computeUvRadialDeadZoneRadius(camera, pivot);
    expect(deadZone).toBeGreaterThan(0.5);
  });
});
