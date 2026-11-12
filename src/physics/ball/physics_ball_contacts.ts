import * as THREE from 'three';
import type { PhysicsBall } from './physics_ball.js';
import {
  PHYSICS_BALL_CONTACT_SKIN_METERS,
  PHYSICS_BALL_MOVER_RESTITUTION,
  PHYSICS_BALL_OVERLAP_SLOP_METERS,
  PHYSICS_BALL_PAIR_RESTITUTION,
  PHYSICS_BALL_RADIUS_METERS,
} from './physics_ball_constants.js';

/**
 * A moving player as the balls see it: a kinematic upright capsule with a
 * velocity. Balls bounce off it and take its velocity along the contact normal;
 * it is never pushed back.
 */
export interface PhysicsBallMover {
  /** Feet position (bottom of the capsule). */
  readonly feet: THREE.Vector3;
  /** Velocity in meters per second. */
  readonly velocity: THREE.Vector3;
  /** Capsule radius. */
  readonly radius: number;
  /** Capsule height from the feet to the top. */
  readonly height: number;
}

const scratchNormal = new THREE.Vector3();
const scratchClosest = new THREE.Vector3();
const scratchRelative = new THREE.Vector3();
const FALLBACK_NORMAL = new THREE.Vector3(1, 0, 0);

/**
 * Separates two overlapping balls and exchanges momentum along the contact
 * normal (equal masses). Both wake up.
 *
 * @param a First ball.
 * @param b Second ball.
 * @returns Closing speed when they hit, 0 when only pushed apart, -1 when apart
 *   or merely resting against each other.
 */
export function physicsBallPairResolve(a: PhysicsBall, b: PhysicsBall): number {
  scratchNormal.subVectors(b.position, a.position);
  const distance = scratchNormal.length();
  const overlap = 2 * PHYSICS_BALL_RADIUS_METERS - distance;
  if (overlap <= 0) return -1;
  physicsBallNormalize(scratchNormal, distance);
  const closing = -scratchRelative.subVectors(b.velocity, a.velocity).dot(scratchNormal);
  if (overlap <= PHYSICS_BALL_OVERLAP_SLOP_METERS && closing <= 0) return -1;
  const push = overlap / 2 + PHYSICS_BALL_CONTACT_SKIN_METERS;
  a.position.addScaledVector(scratchNormal, -push);
  b.position.addScaledVector(scratchNormal, push);
  a.wake();
  b.wake();
  if (closing <= 0) return 0;
  const impulse = (closing * (1 + PHYSICS_BALL_PAIR_RESTITUTION)) / 2;
  a.velocity.addScaledVector(scratchNormal, -impulse);
  b.velocity.addScaledVector(scratchNormal, impulse);
  return closing;
}

/**
 * Pushes a ball out of a player capsule and bounces it off the moving capsule
 * (the capsule has infinite mass, so the ball takes the player's velocity along
 * the normal). The lower end reaches the feet, so balls on the floor are pushed
 * sideways instead of slipping under the player.
 *
 * @param ball Ball.
 * @param mover Player capsule.
 * @returns Closing speed when hit, 0 when only touching, -1 when apart.
 */
export function physicsBallMoverResolve(ball: PhysicsBall, mover: PhysicsBallMover): number {
  const bottom = mover.feet.y;
  const top = mover.feet.y + Math.max(0, mover.height - mover.radius);
  scratchClosest.set(mover.feet.x, THREE.MathUtils.clamp(ball.position.y, bottom, top), mover.feet.z);
  scratchNormal.subVectors(ball.position, scratchClosest);
  const distance = scratchNormal.length();
  const overlap = mover.radius + PHYSICS_BALL_RADIUS_METERS - distance;
  if (overlap <= 0) return -1;
  physicsBallNormalize(scratchNormal, distance);
  ball.position.addScaledVector(scratchNormal, overlap + PHYSICS_BALL_CONTACT_SKIN_METERS);
  ball.wake();
  const closing = -scratchRelative.subVectors(ball.velocity, mover.velocity).dot(scratchNormal);
  if (closing <= 0) return 0;
  ball.velocity.addScaledVector(scratchNormal, closing * (1 + PHYSICS_BALL_MOVER_RESTITUTION));
  return closing;
}

/**
 * Turns a contact offset into a unit normal; coincident centers use +X.
 *
 * @param offset Offset (normalized in place).
 * @param distance Its length.
 */
function physicsBallNormalize(offset: THREE.Vector3, distance: number): void {
  if (distance > 1e-9) offset.divideScalar(distance);
  else offset.copy(FALLBACK_NORMAL);
}
