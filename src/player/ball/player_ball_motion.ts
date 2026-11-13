import type * as THREE from 'three';
import type { PhysicsToyKind } from '@/physics/ball/physics_ball_constants.js';
import {
  PHYSICS_BALL_GRAVITY_METERS_PER_SECOND_SQUARED,
  PHYSICS_BALL_ROLL_DAMPING_PER_SECOND,
} from '@/physics/ball/physics_ball_constants.js';

/** A ball state at a local time, as receivers keep it. */
export interface PlayerBallSample {
  readonly time: number;
  readonly kind: PhysicsToyKind;
  /** Orientation (paper planes; identity for balls). */
  readonly quaternion: THREE.Quaternion;
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  readonly sleeping: boolean;
  readonly rolling: boolean;
  readonly bounces: number;
  readonly strength: number;
  /** Whether the thrower heard a bounce since the previous sample. */
  readonly bounced: boolean;
}

/**
 * Moves a sample forward without collision, the way the ball would fly with
 * nothing in its way: resting balls stay, rolling balls slow down along the
 * surface, flying balls follow the gravity arc and flying planes glide straight
 * on (lift about carries their weight).
 *
 * @param sample Known state.
 * @param seconds Time since the sample.
 * @param target Receives the position.
 * @returns The target.
 */
export function playerBallMotionPosition(
  sample: PlayerBallSample,
  seconds: number,
  target: THREE.Vector3,
): THREE.Vector3 {
  target.copy(sample.position);
  if (sample.sleeping) return target;
  if (sample.rolling) {
    const travel =
      (1 - Math.exp(-PHYSICS_BALL_ROLL_DAMPING_PER_SECOND * seconds)) / PHYSICS_BALL_ROLL_DAMPING_PER_SECOND;
    return target.set(target.x + sample.velocity.x * travel, target.y, target.z + sample.velocity.z * travel);
  }
  target.addScaledVector(sample.velocity, seconds);
  if (sample.kind === 'plane') return target;
  target.y -= 0.5 * PHYSICS_BALL_GRAVITY_METERS_PER_SECOND_SQUARED * seconds * seconds;
  return target;
}

/**
 * Returns the velocity matching playerBallMotionPosition.
 *
 * @param sample Known state.
 * @param seconds Time since the sample.
 * @param target Receives the velocity.
 * @returns The target.
 */
export function playerBallMotionVelocity(
  sample: PlayerBallSample,
  seconds: number,
  target: THREE.Vector3,
): THREE.Vector3 {
  if (sample.sleeping) return target.set(0, 0, 0);
  target.copy(sample.velocity);
  if (sample.rolling) return target.multiplyScalar(Math.exp(-PHYSICS_BALL_ROLL_DAMPING_PER_SECOND * seconds));
  if (sample.kind === 'plane') return target;
  target.y -= PHYSICS_BALL_GRAVITY_METERS_PER_SECOND_SQUARED * seconds;
  return target;
}
