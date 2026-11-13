import * as THREE from 'three';
import type { PhysicsLevelWorld } from '@/physics/level/physics_level_world.js';
import { PhysicsBall } from './physics_ball.js';
import {
  PHYSICS_BALL_GRAVITY_METERS_PER_SECOND_SQUARED,
  PHYSICS_BALL_STEP_SECONDS,
  PHYSICS_PLANE_ALIGN_PER_SECOND,
  PHYSICS_PLANE_ATTITUDE_MAXIMUM_RADIANS,
  PHYSICS_PLANE_BANK_PER_TURN_RATE,
  PHYSICS_PLANE_LIFT_MAXIMUM_G,
  PHYSICS_PLANE_LIFT_TO_DRAG,
  PHYSICS_PLANE_SKID_FRICTION,
  PHYSICS_PLANE_TRIM_SPEED_METERS_PER_SECOND,
  PHYSICS_TOY_SHAPES,
} from './physics_ball_constants.js';

const scratchDirection = new THREE.Vector3();
const scratchLift = new THREE.Vector3();
/** Horizontal speed above which the heading follows the velocity. */
const PHYSICS_PLANE_HEADING_SPEED = 0.2;

/**
 * A paper plane: a small light sphere for collision, the ball's sweeps and
 * contacts, plus a glider in the air. Lift grows with the square of the speed
 * and acts across the flight path, so a fast plane climbs, a slow one sinks,
 * and a dive builds speed until lift pulls it up again (a phugoid: down, then
 * an upward arch, settling into a gentle glide as drag damps it). The nose
 * follows the flight path (pitch-stable). Touching down it slides instead of
 * bouncing and skids to a halt by friction; sliding off a ledge it is airborne
 * again and flies on. Heading, pitch and roll are kept for drawing.
 */
export class PhysicsPlane extends PhysicsBall {
  /** Heading in radians around +Y (0 flies towards -Z). */
  yaw: number;
  /** Nose pitch in radians, positive up. */
  pitch: number;
  /** Bank in radians, positive lifts the right wing (a left turn). */
  roll: number;

  /**
   * Creates a plane at its throw state, facing along the throw.
   *
   * @param origin Throw origin.
   * @param velocity Throw velocity.
   */
  constructor(origin: THREE.Vector3, velocity: THREE.Vector3) {
    super(origin, velocity, PHYSICS_TOY_SHAPES.plane);
    this.yaw = Math.atan2(-velocity.x, -velocity.z);
    this.pitch = Math.atan2(velocity.y, Math.hypot(velocity.x, velocity.z));
    this.roll = 0;
  }

  /**
   * Advances one step and turns the plane along its motion.
   *
   * @param levelWorld Level collision.
   */
  override advance(levelWorld: PhysicsLevelWorld): void {
    super.advance(levelWorld);
    if (!this.isResting) this.orient();
  }

  /** Gravity, lift across the flight path and drag along it. */
  protected override applyAirForces(): void {
    const gravity = PHYSICS_BALL_GRAVITY_METERS_PER_SECOND_SQUARED;
    const speed = this.velocity.length();
    if (speed > 1e-4) {
      const direction = scratchDirection.copy(this.velocity).divideScalar(speed);
      const climb = Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1));
      const lift = scratchLift.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).multiplyScalar(-Math.sin(climb));
      lift.y = Math.cos(climb);
      lift.addScaledVector(direction, -lift.dot(direction));
      const pressure = (speed / PHYSICS_PLANE_TRIM_SPEED_METERS_PER_SECOND) ** 2;
      const liftLength = lift.length();
      if (liftLength > 1e-6) {
        const force = Math.min(pressure, PHYSICS_PLANE_LIFT_MAXIMUM_G) * gravity;
        this.velocity.addScaledVector(lift, (force / liftLength) * PHYSICS_BALL_STEP_SECONDS);
      }
      const drag = Math.min(speed, ((pressure * gravity) / PHYSICS_PLANE_LIFT_TO_DRAG) * PHYSICS_BALL_STEP_SECONDS);
      this.velocity.addScaledVector(direction, -drag);
    }
    this.velocity.y -= gravity * PHYSICS_BALL_STEP_SECONDS;
  }

  /** Slows a skidding plane by sliding friction and keeps it on the surface. */
  protected override applyRollingDamping(): void {
    const gravity = PHYSICS_BALL_GRAVITY_METERS_PER_SECOND_SQUARED;
    const horizontal = Math.hypot(this.velocity.x, this.velocity.z);
    const slow = PHYSICS_PLANE_SKID_FRICTION * gravity * PHYSICS_BALL_STEP_SECONDS;
    const keep = horizontal > slow ? (horizontal - slow) / horizontal : 0;
    this.velocity.x *= keep;
    this.velocity.z *= keep;
    this.velocity.y -= gravity * PHYSICS_BALL_STEP_SECONDS;
  }

  /**
   * Turns heading, pitch and bank towards the motion: in the air the nose
   * follows the flight path and turns bank the wings; sliding it lies flat.
   */
  private orient(): void {
    const step = PHYSICS_BALL_STEP_SECONDS;
    const align = 1 - Math.exp(-PHYSICS_PLANE_ALIGN_PER_SECOND * step);
    const limit = PHYSICS_PLANE_ATTITUDE_MAXIMUM_RADIANS;
    const horizontal = Math.hypot(this.velocity.x, this.velocity.z);
    let turn = 0;
    if (horizontal > PHYSICS_PLANE_HEADING_SPEED) {
      const heading = Math.atan2(-this.velocity.x, -this.velocity.z);
      turn = physicsPlaneAngle(heading - this.yaw) * align;
      this.yaw = physicsPlaneAngle(this.yaw + turn);
    }
    const flying = !this.isOnGround;
    const pitchTarget = flying ? Math.atan2(this.velocity.y, horizontal) : 0;
    const rollTarget = flying ? (turn / step) * PHYSICS_PLANE_BANK_PER_TURN_RATE : 0;
    this.pitch = THREE.MathUtils.clamp(this.pitch + (pitchTarget - this.pitch) * align, -limit, limit);
    this.roll = THREE.MathUtils.clamp(this.roll + (rollTarget - this.roll) * align, -limit, limit);
  }

  /**
   * Returns whether it skids along a surface.
   *
   * @returns True while on the ground and moving.
   */
  isSkidding(): boolean {
    return this.isRolling();
  }
}

/**
 * Wraps an angle into -PI..PI.
 *
 * @param radians Angle.
 * @returns Wrapped angle.
 */
export function physicsPlaneAngle(radians: number): number {
  return radians - 2 * Math.PI * Math.round(radians / (2 * Math.PI));
}
