import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  playerCapsuleHeightMeters,
  playerCapsuleRadiusMeters,
  playerEyeHeightMeters,
  playerEyePositionFromFeet,
  playerSamplePointAtHeight,
} from '@/player/collision/player_capsule_collider.js';
import {
  PLAYER_COLLIDER_HEIGHT_METERS,
  PLAYER_COLLIDER_RADIUS_METERS,
  PLAYER_EYE_HEIGHT_METERS,
} from '@/player/player_constants.js';

describe('player capsule helpers', () => {
  it('exposes the configured capsule dimensions', () => {
    expect(playerCapsuleHeightMeters()).toBe(PLAYER_COLLIDER_HEIGHT_METERS);
    expect(playerCapsuleRadiusMeters()).toBe(PLAYER_COLLIDER_RADIUS_METERS);
    expect(playerEyeHeightMeters()).toBe(PLAYER_EYE_HEIGHT_METERS);
  });

  it('builds eye and sample positions above the feet', () => {
    const feet = new THREE.Vector3(3, 1, -2);
    const eye = playerEyePositionFromFeet(feet, new THREE.Vector3());
    expect(eye.x).toBeCloseTo(3);
    expect(eye.y).toBeCloseTo(1 + PLAYER_EYE_HEIGHT_METERS);
    expect(eye.z).toBeCloseTo(-2);
    const mid = playerSamplePointAtHeight(feet, 0.5, new THREE.Vector3());
    expect(mid.y).toBeCloseTo(1 + PLAYER_COLLIDER_HEIGHT_METERS * 0.5);
  });
});
