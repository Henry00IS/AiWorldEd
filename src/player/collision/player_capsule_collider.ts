import * as THREE from 'three';
import {
  PLAYER_COLLIDER_HEIGHT_METERS,
  PLAYER_COLLIDER_RADIUS_METERS,
  PLAYER_EYE_HEIGHT_METERS,
} from '@/player/player_constants.js';

/**
 * Returns the capsule radius used for player collision.
 *
 * @returns Radius in meters.
 */
export function playerCapsuleRadiusMeters(): number {
  return PLAYER_COLLIDER_RADIUS_METERS;
}

/**
 * Returns the full capsule height including hemispherical caps approximation.
 *
 * @returns Height in meters.
 */
export function playerCapsuleHeightMeters(): number {
  return PLAYER_COLLIDER_HEIGHT_METERS;
}

/**
 * Returns the eye height above the feet.
 *
 * @returns Eye height in meters.
 */
export function playerEyeHeightMeters(): number {
  return PLAYER_EYE_HEIGHT_METERS;
}

/**
 * Writes the world-space eye position from feet into the target vector.
 *
 * @param feetPosition Player feet world position.
 * @param target Destination vector.
 * @returns The target vector.
 */
export function playerEyePositionFromFeet(feetPosition: THREE.Vector3, target: THREE.Vector3): THREE.Vector3 {
  return target.set(feetPosition.x, feetPosition.y + PLAYER_EYE_HEIGHT_METERS, feetPosition.z);
}

/**
 * Writes a horizontal sample height above the feet into the target vector.
 *
 * @param feetPosition Player feet world position.
 * @param heightFraction Fraction of collider height (0 feet, 1 top).
 * @param target Destination vector.
 * @returns The target vector.
 */
export function playerSamplePointAtHeight(
  feetPosition: THREE.Vector3,
  heightFraction: number,
  target: THREE.Vector3,
): THREE.Vector3 {
  const clamped = Math.max(0, Math.min(1, heightFraction));
  const height = PLAYER_COLLIDER_HEIGHT_METERS * clamped;
  return target.set(feetPosition.x, feetPosition.y + height, feetPosition.z);
}
