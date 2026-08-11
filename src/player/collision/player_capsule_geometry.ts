import * as THREE from 'three';
import { PLAYER_COLLIDER_HEIGHT_METERS, PLAYER_COLLIDER_RADIUS_METERS } from '@/player/player_constants.js';

/** World-space vertical capsule defined by a segment and radius. */
export interface PlayerCapsuleSegment {
  segmentBottom: THREE.Vector3;
  segmentTop: THREE.Vector3;
  radius: number;
}

/**
 * Returns the configured capsule radius in meters.
 *
 * @returns Capsule radius.
 */
export function playerCapsuleGeometryRadiusMeters(): number {
  return PLAYER_COLLIDER_RADIUS_METERS;
}

/**
 * Returns the configured full capsule height in meters.
 *
 * @returns Capsule height including end caps.
 */
export function playerCapsuleGeometryHeightMeters(): number {
  return PLAYER_COLLIDER_HEIGHT_METERS;
}

/**
 * Writes the vertical capsule segment endpoints from a feet position.
 *
 * @param feetPosition World-space feet position.
 * @param segmentBottom Destination for the lower sphere center.
 * @param segmentTop Destination for the upper sphere center.
 */
export function playerCapsuleSegmentFromFeet(
  feetPosition: THREE.Vector3,
  segmentBottom: THREE.Vector3,
  segmentTop: THREE.Vector3,
): void {
  const radius = PLAYER_COLLIDER_RADIUS_METERS;
  const height = PLAYER_COLLIDER_HEIGHT_METERS;
  const topOffset = Math.max(radius, height - radius);
  segmentBottom.set(feetPosition.x, feetPosition.y + radius, feetPosition.z);
  segmentTop.set(feetPosition.x, feetPosition.y + topOffset, feetPosition.z);
}

/**
 * Expands a world AABB to tightly cover the capsule at the given feet pose.
 *
 * @param feetPosition World-space feet position.
 * @param target Destination box mutated in place.
 * @returns The target box.
 */
export function playerCapsuleAabbFromFeet(feetPosition: THREE.Vector3, target: THREE.Box3): THREE.Box3 {
  const radius = PLAYER_COLLIDER_RADIUS_METERS;
  const height = PLAYER_COLLIDER_HEIGHT_METERS;
  target.min.set(feetPosition.x - radius, feetPosition.y, feetPosition.z - radius);
  target.max.set(feetPosition.x + radius, feetPosition.y + height, feetPosition.z + radius);
  return target;
}

/**
 * Expands a capsule AABB by a uniform margin on every axis.
 *
 * @param box Capsule AABB mutated in place.
 * @param marginMeters Margin in meters.
 * @returns The expanded box.
 */
export function playerCapsuleAabbExpand(box: THREE.Box3, marginMeters: number): THREE.Box3 {
  box.min.x -= marginMeters;
  box.min.y -= marginMeters;
  box.min.z -= marginMeters;
  box.max.x += marginMeters;
  box.max.y += marginMeters;
  box.max.z += marginMeters;
  return box;
}
