import * as THREE from 'three';
import type { PhysicsBallMover } from '@/physics/ball/physics_ball_contacts.js';
import { PHYSICS_TOY_SHAPES, type PhysicsToyKind } from '@/physics/ball/physics_ball_constants.js';
import { PLAYER_COLLIDER_HEIGHT_METERS, PLAYER_COLLIDER_RADIUS_METERS } from '@/player/player_constants.js';
import {
  PLAYER_BALL_MOVER_SPEED_MAXIMUM_METERS_PER_SECOND,
  PLAYER_BALL_MOVER_VERTICAL_MAXIMUM_METERS_PER_SECOND,
} from './player_ball_constants.js';

/** Where a player stands and how fast it moves. */
export interface PlayerBallMotion {
  readonly feet: THREE.Vector3;
  readonly velocity: THREE.Vector3;
}

/**
 * Builds the kinematic capsule of a player for the balls, with the velocity
 * clamped to plausible walking, running and jumping speeds (a smoothed presence
 * velocity can spike after a hitch).
 *
 * @param motion Feet and velocity.
 * @returns Capsule the size of the player collider.
 */
export function playerBallMover(motion: PlayerBallMotion): PhysicsBallMover {
  const velocity = motion.velocity.clone();
  const horizontal = Math.hypot(velocity.x, velocity.z);
  if (horizontal > PLAYER_BALL_MOVER_SPEED_MAXIMUM_METERS_PER_SECOND) {
    const scale = PLAYER_BALL_MOVER_SPEED_MAXIMUM_METERS_PER_SECOND / horizontal;
    velocity.x *= scale;
    velocity.z *= scale;
  }
  const vertical = PLAYER_BALL_MOVER_VERTICAL_MAXIMUM_METERS_PER_SECOND;
  velocity.y = THREE.MathUtils.clamp(velocity.y, -vertical, vertical);
  return {
    feet: motion.feet.clone(),
    velocity,
    radius: PLAYER_COLLIDER_RADIUS_METERS,
    height: PLAYER_COLLIDER_HEIGHT_METERS,
  };
}

/**
 * Builds the capsules of every player in play mode: the others as shown from
 * presence and the local player from its own body.
 *
 * @param others Other members in play mode.
 * @param local Local player, or null outside play mode.
 * @returns Capsules.
 */
export function playerBallMovers(
  others: readonly PlayerBallMotion[],
  local: PlayerBallMotion | null,
): PhysicsBallMover[] {
  return [...others, ...(local ? [local] : [])].map(playerBallMover);
}

/**
 * Builds the one-way proxy of another member's ball for the local simulation: a
 * kinematic sphere (a capsule as tall as it is wide) at the drawn position with
 * the drawn velocity, so own balls bounce off it but never push it.
 *
 * @param ball Drawn position and velocity of the other ball.
 * @returns Proxy mover.
 */
export function playerBallProxy(ball: {
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  readonly kind?: PhysicsToyKind;
}): PhysicsBallMover {
  const radius = PHYSICS_TOY_SHAPES[ball.kind ?? 'tennis'].radius;
  return {
    feet: ball.position.clone().setY(ball.position.y - radius),
    velocity: ball.velocity.clone(),
    radius,
    height: 2 * radius,
  };
}
