import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  playerCapsuleAabbExpand,
  playerCapsuleAabbFromFeet,
  playerCapsuleGeometryHeightMeters,
  playerCapsuleGeometryRadiusMeters,
  playerCapsuleSegmentFromFeet,
} from '@/player/collision/player_capsule_geometry.js';
import { PLAYER_COLLIDER_HEIGHT_METERS, PLAYER_COLLIDER_RADIUS_METERS } from '@/player/player_constants.js';

describe('player_capsule_geometry', () => {
  it('exposes configured capsule dimensions', () => {
    expect(playerCapsuleGeometryRadiusMeters()).toBe(PLAYER_COLLIDER_RADIUS_METERS);
    expect(playerCapsuleGeometryHeightMeters()).toBe(PLAYER_COLLIDER_HEIGHT_METERS);
  });

  it('builds a vertical segment from feet with hemispherical ends', () => {
    const feet = new THREE.Vector3(2, 5, -1);
    const bottom = new THREE.Vector3();
    const top = new THREE.Vector3();
    playerCapsuleSegmentFromFeet(feet, bottom, top);
    expect(bottom.x).toBeCloseTo(2);
    expect(bottom.y).toBeCloseTo(5 + PLAYER_COLLIDER_RADIUS_METERS);
    expect(top.y).toBeCloseTo(5 + PLAYER_COLLIDER_HEIGHT_METERS - PLAYER_COLLIDER_RADIUS_METERS);
    expect(top.z).toBeCloseTo(-1);
  });

  it('builds and expands a capsule AABB', () => {
    const feet = new THREE.Vector3(0, 0, 0);
    const box = playerCapsuleAabbFromFeet(feet, new THREE.Box3());
    expect(box.min.y).toBeCloseTo(0);
    expect(box.max.y).toBeCloseTo(PLAYER_COLLIDER_HEIGHT_METERS);
    expect(box.min.x).toBeCloseTo(-PLAYER_COLLIDER_RADIUS_METERS);
    playerCapsuleAabbExpand(box, 0.1);
    expect(box.min.x).toBeCloseTo(-PLAYER_COLLIDER_RADIUS_METERS - 0.1);
  });
});
