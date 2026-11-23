import * as THREE from 'three';
import {
  PLAYER_CAPSULE_CENTER_ABOVE_FEET_METERS,
  PLAYER_CAPSULE_HALF_SEGMENT_METERS,
} from '@/player/collision/player_collision_character_rig.js';
import { PLAYER_COLLIDER_RADIUS_METERS, PLAYER_MIN_WALKABLE_NORMAL_Y } from '@/player/player_constants.js';
import {
  PLAYER_GRAPPLE_AIM_METERS_PER_SECOND_SQUARED,
  PLAYER_GRAPPLE_ARRIVE_METERS,
  PLAYER_GRAPPLE_BRAKE_METERS_PER_SECOND_SQUARED,
  PLAYER_GRAPPLE_CEILING_CLEARANCE_METERS,
  PLAYER_GRAPPLE_CLEARANCE_METERS,
  PLAYER_GRAPPLE_CLIMB_METERS_PER_SECOND_SQUARED,
  PLAYER_GRAPPLE_CLIMB_SPEED_METERS_PER_SECOND,
  PLAYER_GRAPPLE_HANG_DAMPING_PER_SECOND,
  PLAYER_GRAPPLE_LEDGE_LIFT_METERS,
  PLAYER_GRAPPLE_MAX_SPEED_METERS_PER_SECOND,
  PLAYER_GRAPPLE_PULL_LENGTH_CAP_METERS,
  PLAYER_GRAPPLE_PULL_METERS_PER_SECOND_SQUARED,
  PLAYER_GRAPPLE_PULL_PER_METER,
  PLAYER_GRAPPLE_ROPE_STIFFNESS_PER_SECOND_SQUARED,
  PLAYER_GRAPPLE_ROPE_SWING_SPEED_METERS_PER_SECOND,
  PLAYER_GRAPPLE_SLACK_METERS,
  PLAYER_GRAPPLE_SWING_DAMPING_PER_SECOND,
  PLAYER_GRAPPLE_YANK_AWAY_KEPT,
  PLAYER_GRAPPLE_YANK_LIFT_METERS_PER_SECOND,
  PLAYER_GRAPPLE_YANK_METERS_PER_SECOND,
} from './player_grapple_constants.js';

const scratchDirection = new THREE.Vector3();
const scratchAcross = new THREE.Vector3();

/**
 * Returns where the pull brings the body center for a beam hooked on a surface:
 * off it along its normal by as much as the capsule reaches that way plus a
 * clearance (so the camera never gets close enough to see through it), and on a
 * floor or ledge top a little higher, so the feet come up over the edge.
 *
 * @param point Hit point.
 * @param normal Unit surface normal facing the shooter.
 * @param target Destination.
 * @returns The target vector.
 */
export function playerGrappleTarget(point: THREE.Vector3, normal: THREE.Vector3, target: THREE.Vector3): THREE.Vector3 {
  const reach = PLAYER_COLLIDER_RADIUS_METERS + PLAYER_CAPSULE_HALF_SEGMENT_METERS * Math.abs(normal.y);
  const clearance = PLAYER_GRAPPLE_CLEARANCE_METERS + PLAYER_GRAPPLE_CEILING_CLEARANCE_METERS * Math.max(0, -normal.y);
  target.copy(point).addScaledVector(normal, reach + clearance);
  if (normal.y >= PLAYER_MIN_WALKABLE_NORMAL_Y) target.y += PLAYER_GRAPPLE_LEDGE_LIFT_METERS;
  return target;
}

/**
 * Returns the offset from the body center to the pull target.
 *
 * @param feet Feet position.
 * @param target Pull target.
 * @param offset Destination.
 * @returns The offset vector.
 */
export function playerGrappleOffset(feet: THREE.Vector3, target: THREE.Vector3, offset: THREE.Vector3): THREE.Vector3 {
  return offset.subVectors(target, feet).setY(target.y - feet.y - PLAYER_CAPSULE_CENTER_ABOVE_FEET_METERS);
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
 * by the body as usual). Far out the pull is a strong acceleration toward the
 * target, stronger for long beams, plus a little along the aim; only the
 * velocity across the beam is damped, so the body swings in arcs. The speed is
 * braked to what can still stop at the slack, so the body zips in without
 * overshooting. The last stretch acts as a rope: within the slack of the target
 * nothing pulls, beyond it a stiff spring holds the body, and the motion there
 * is damped, so the body hangs a little off the target and settles instead of
 * swinging wildly. The speed never passes the cap while pulling.
 *
 * @param velocity Body velocity (changed).
 * @param offset Offset from the body center to the target.
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
  const stretch = Math.max(0, length - PLAYER_GRAPPLE_SLACK_METERS);
  const far = Math.min(1, stretch / PLAYER_GRAPPLE_ARRIVE_METERS);
  if (stretch > 0) {
    const direction = scratchDirection.copy(offset).divideScalar(length);
    const reach = Math.min(length, PLAYER_GRAPPLE_PULL_LENGTH_CAP_METERS);
    const full = PLAYER_GRAPPLE_PULL_METERS_PER_SECOND_SQUARED + PLAYER_GRAPPLE_PULL_PER_METER * reach;
    const pull = Math.min(full, PLAYER_GRAPPLE_ROPE_STIFFNESS_PER_SECOND_SQUARED * stretch);
    velocity.addScaledVector(direction, pull * deltaSeconds);
    velocity.addScaledVector(aim, PLAYER_GRAPPLE_AIM_METERS_PER_SECOND_SQUARED * far * deltaSeconds);
    const along = velocity.dot(direction);
    const across = scratchAcross.copy(velocity).addScaledVector(direction, -along);
    const keep = Math.exp(-PLAYER_GRAPPLE_SWING_DAMPING_PER_SECOND * deltaSeconds);
    velocity.copy(direction).multiplyScalar(along).addScaledVector(across, keep);
  }
  velocity.multiplyScalar(Math.exp(-PLAYER_GRAPPLE_HANG_DAMPING_PER_SECOND * (1 - far) * deltaSeconds));
  const stoppable =
    Math.sqrt(2 * PLAYER_GRAPPLE_BRAKE_METERS_PER_SECOND_SQUARED * stretch) +
    PLAYER_GRAPPLE_ROPE_SWING_SPEED_METERS_PER_SECOND;
  const limit = Math.min(PLAYER_GRAPPLE_MAX_SPEED_METERS_PER_SECOND, stoppable);
  const speed = velocity.length();
  if (speed > limit) velocity.multiplyScalar(limit / speed);
}

/**
 * Returns the vertical speed after one step of climbing (Space held on the
 * beam): a gentle push up, never past the climb speed (a faster rise is left
 * alone).
 *
 * @param verticalSpeed Vertical speed.
 * @param deltaSeconds Step in seconds.
 * @returns New vertical speed.
 */
export function playerGrappleClimb(verticalSpeed: number, deltaSeconds: number): number {
  if (verticalSpeed >= PLAYER_GRAPPLE_CLIMB_SPEED_METERS_PER_SECOND) return verticalSpeed;
  return Math.min(
    PLAYER_GRAPPLE_CLIMB_SPEED_METERS_PER_SECOND,
    verticalSpeed + PLAYER_GRAPPLE_CLIMB_METERS_PER_SECOND_SQUARED * deltaSeconds,
  );
}
