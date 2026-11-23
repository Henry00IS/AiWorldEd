import * as THREE from 'three';
import { PLAYER_GRAVITY_METERS_PER_SECOND_SQUARED, PLAYER_MIN_WALKABLE_NORMAL_Y } from '@/player/player_constants.js';
import {
  PLAYER_GRAPPLE_AIM_METERS_PER_SECOND_SQUARED,
  PLAYER_GRAPPLE_ARRIVE_DAMPING_PER_SECOND,
  PLAYER_GRAPPLE_ARRIVE_METERS,
  PLAYER_GRAPPLE_BRAKE_METERS_PER_SECOND_SQUARED,
  PLAYER_GRAPPLE_MAX_SPEED_METERS_PER_SECOND,
  PLAYER_GRAPPLE_PULL_HEIGHT_METERS,
  PLAYER_GRAPPLE_PULL_LENGTH_CAP_METERS,
  PLAYER_GRAPPLE_PULL_METERS_PER_SECOND_SQUARED,
  PLAYER_GRAPPLE_PULL_PER_METER,
  PLAYER_GRAPPLE_STANDOFF_METERS,
  PLAYER_GRAPPLE_SWING_DAMPING_PER_SECOND,
  PLAYER_GRAPPLE_YANK_AWAY_KEPT,
  PLAYER_GRAPPLE_YANK_LIFT_METERS_PER_SECOND,
  PLAYER_GRAPPLE_YANK_METERS_PER_SECOND,
} from './player_grapple_constants.js';

const scratchDirection = new THREE.Vector3();
const scratchAcross = new THREE.Vector3();

/**
 * Returns where the pull aims for a beam hooked on a surface: a little off it
 * along its normal, and on a floor or ledge top as high again as the pulled
 * point sits above the feet, so the feet come up over the edge onto it.
 *
 * @param point Hit point.
 * @param normal Unit surface normal facing the shooter.
 * @param target Destination.
 * @returns The target vector.
 */
export function playerGrappleTarget(point: THREE.Vector3, normal: THREE.Vector3, target: THREE.Vector3): THREE.Vector3 {
  target.copy(point).addScaledVector(normal, PLAYER_GRAPPLE_STANDOFF_METERS);
  if (normal.y >= PLAYER_MIN_WALKABLE_NORMAL_Y) target.y += PLAYER_GRAPPLE_PULL_HEIGHT_METERS;
  return target;
}

/**
 * Returns the offset from the pulled point of the body (low above the feet) to
 * the pull target.
 *
 * @param feet Feet position.
 * @param target Pull target.
 * @param offset Destination.
 * @returns The offset vector.
 */
export function playerGrappleOffset(feet: THREE.Vector3, target: THREE.Vector3, offset: THREE.Vector3): THREE.Vector3 {
  return offset.subVectors(target, feet).setY(target.y - feet.y - PLAYER_GRAPPLE_PULL_HEIGHT_METERS);
}

/**
 * Kicks the velocity toward the anchor when the beam hooks (most of any speed
 * away from it is taken out first), and up off the ground when standing, so
 * leaving the floor and turning in the air are instant.
 *
 * @param velocity Body velocity (changed).
 * @param offset Offset to the pull target.
 * @param grounded Whether the body stands on the ground.
 */
export function playerGrappleYank(velocity: THREE.Vector3, offset: THREE.Vector3, grounded: boolean): void {
  const length = offset.length();
  if (length > 1e-6) {
    const away = Math.min(0, velocity.dot(offset) / length);
    const kick = PLAYER_GRAPPLE_YANK_METERS_PER_SECOND - away * (1 - PLAYER_GRAPPLE_YANK_AWAY_KEPT);
    velocity.addScaledVector(offset, kick / length);
  }
  if (grounded) velocity.y = Math.max(velocity.y, PLAYER_GRAPPLE_YANK_LIFT_METERS_PER_SECOND);
}

/**
 * Applies one step of the beam's attraction to the velocity (gravity is applied
 * by the body as usual). The pull is a spring-like acceleration toward the
 * target, stronger for long beams, plus a little along the aim; only the
 * velocity across the beam is damped, so the body swings in arcs. Near the
 * target the pull eases off, gravity is held and the motion damped, and the
 * speed is braked to what can still stop at the target, so the body zips in and
 * comes to rest there rather than overshooting. The speed never passes the cap
 * while pulling.
 *
 * @param velocity Body velocity (changed).
 * @param offset Offset from the pulled point of the body to the target.
 * @param aim Unit look direction.
 * @param deltaSeconds Step in seconds.
 */
export function playerGrapplePull(
  velocity: THREE.Vector3,
  offset: THREE.Vector3,
  aim: THREE.Vector3,
  deltaSeconds: number,
): void {
  const length = offset.length();
  const far = THREE.MathUtils.clamp(length / PLAYER_GRAPPLE_ARRIVE_METERS, 0, 1);
  if (length > 1e-6) {
    const direction = scratchDirection.copy(offset).divideScalar(length);
    const reach = Math.min(length, PLAYER_GRAPPLE_PULL_LENGTH_CAP_METERS);
    const pull = (PLAYER_GRAPPLE_PULL_METERS_PER_SECOND_SQUARED + PLAYER_GRAPPLE_PULL_PER_METER * reach) * far;
    velocity.addScaledVector(direction, pull * deltaSeconds);
    velocity.addScaledVector(aim, PLAYER_GRAPPLE_AIM_METERS_PER_SECOND_SQUARED * far * deltaSeconds);
    const along = velocity.dot(direction);
    const across = scratchAcross.copy(velocity).addScaledVector(direction, -along);
    const keep = Math.exp(-PLAYER_GRAPPLE_SWING_DAMPING_PER_SECOND * deltaSeconds);
    velocity.copy(direction).multiplyScalar(along).addScaledVector(across, keep);
  }
  velocity.y += PLAYER_GRAVITY_METERS_PER_SECOND_SQUARED * (1 - far) * deltaSeconds;
  velocity.multiplyScalar(Math.exp(-PLAYER_GRAPPLE_ARRIVE_DAMPING_PER_SECOND * (1 - far) * deltaSeconds));
  const stoppable = Math.sqrt(2 * PLAYER_GRAPPLE_BRAKE_METERS_PER_SECOND_SQUARED * length);
  const limit = Math.min(PLAYER_GRAPPLE_MAX_SPEED_METERS_PER_SECOND, stoppable);
  const speed = velocity.length();
  if (speed > limit) velocity.multiplyScalar(limit / speed);
}
