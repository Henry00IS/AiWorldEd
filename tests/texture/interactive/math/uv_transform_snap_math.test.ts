import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  snapUvMoveWorldDelta,
  snapUvRotationDegrees,
  snapUvScaleFactor,
  type UvTransformSnapOptions,
} from '@/texture/interactive/math/uv_transform_snap_math.js';

const snapOn: UvTransformSnapOptions = {
  enabled: true,
  translationInterval: 0.5,
  rotationSnapDegrees: 15,
  scaleSnapInterval: 0.25,
};

const snapOff: UvTransformSnapOptions = {
  ...snapOn,
  enabled: false,
};

describe('uv_transform_snap_math', () => {
  it('snaps planar move deltas to the translation interval', () => {
    const raw = new THREE.Vector3(0.4, 0, 0.1);
    const snapped = snapUvMoveWorldDelta(raw, new THREE.Vector3(0, 1, 0), snapOn);
    expect(snapped.x).toBeCloseTo(0.5, 6);
    expect(snapped.z).toBeCloseTo(0, 6);
  });

  it('passes through move deltas when snap is disabled', () => {
    const raw = new THREE.Vector3(0.4, 0, 0.1);
    const result = snapUvMoveWorldDelta(raw, new THREE.Vector3(0, 1, 0), snapOff);
    expect(result.x).toBeCloseTo(0.4, 6);
    expect(result.z).toBeCloseTo(0.1, 6);
  });

  it('snaps rotation degrees and scale factors', () => {
    expect(snapUvRotationDegrees(22, snapOn)).toBeCloseTo(15, 6);
    expect(snapUvScaleFactor(1.1, snapOn)).toBeCloseTo(1, 6);
    expect(snapUvRotationDegrees(22, snapOff)).toBeCloseTo(22, 6);
  });
});
