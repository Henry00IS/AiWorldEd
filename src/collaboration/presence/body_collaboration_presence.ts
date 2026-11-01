import * as THREE from 'three';
import type { MotionCollaborationPresence } from '@/collaboration/presence/look_collaboration_presence.js';
import type { PlayerLocomotionBody } from '@/player/character/locomotion/player_locomotion_body.js';

/**
 * Time constant of the velocity estimate, in seconds (most of one presence
 * interval, so late or bunched frames do not make the stride stutter).
 */
export const BODY_COLLABORATION_PRESENCE_RESPONSE_SECONDS = 0.15;
/** Speed below which the remote body counts as standing. */
export const BODY_COLLABORATION_PRESENCE_STAND_SPEED = 0.05;
/** Largest speed accepted from one frame (guards against hitches). */
const BODY_COLLABORATION_PRESENCE_SPEED_LIMIT = 30;

/**
 * A remote collaborator's body rebuilt from the smoothed presence: velocity
 * from the interpolated feet, ground, wall push and run from the motion flags,
 * and the wall (when pushing) straight ahead of the body facing. Feeds the same
 * animation the local player uses, so walking speed drives the stride and feet
 * do not slide.
 */
export class BodyCollaborationPresence implements PlayerLocomotionBody {
  private readonly last: THREE.Vector3;
  private readonly velocity: THREE.Vector3;
  private hasLast: boolean;
  private yaw: number;
  private motion: MotionCollaborationPresence;

  /** Creates a standing, grounded body. */
  constructor() {
    this.last = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.hasLast = false;
    this.yaw = 0;
    this.motion = { grounded: true, wallPushing: false, running: false };
  }

  /** Forgets the motion (after a teleport): the next update starts at rest. */
  reset(): void {
    this.hasLast = false;
    this.velocity.set(0, 0, 0);
  }

  /**
   * Advances the body to the shown pose.
   *
   * @param feet Shown feet position.
   * @param bodyYaw Shown body facing yaw.
   * @param motion Motion flags at the shown time.
   * @param deltaSeconds Time since the previous update.
   */
  update(feet: THREE.Vector3, bodyYaw: number, motion: MotionCollaborationPresence, deltaSeconds: number): void {
    this.yaw = Number.isFinite(bodyYaw) ? bodyYaw : 0;
    this.motion = motion;
    if (this.hasLast && deltaSeconds > 1e-4) {
      const blend = 1 - Math.exp(-deltaSeconds / BODY_COLLABORATION_PRESENCE_RESPONSE_SECONDS);
      const sample = feet.clone().sub(this.last).divideScalar(deltaSeconds);
      if (sample.length() > BODY_COLLABORATION_PRESENCE_SPEED_LIMIT)
        sample.setLength(BODY_COLLABORATION_PRESENCE_SPEED_LIMIT);
      this.velocity.lerp(sample, blend);
    }
    this.last.copy(feet);
    this.hasLast = true;
  }

  /**
   * Returns the body facing yaw.
   *
   * @returns Radians.
   */
  getYaw(): number {
    return this.yaw;
  }

  /** @inheritdoc */
  getPlanarSpeed(): number {
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    return speed < BODY_COLLABORATION_PRESENCE_STAND_SPEED ? 0 : speed;
  }

  /** @inheritdoc */
  getIsGrounded(): boolean {
    return this.motion.grounded;
  }

  /** @inheritdoc */
  getWantsRun(): boolean {
    return this.motion.running;
  }

  /**
   * Returns the vertical velocity (zero on the ground, where the smoothed steps
   * up and down would otherwise read as jumps).
   *
   * @returns Meters per second, positive upward.
   */
  getVerticalVelocity(): number {
    return this.motion.grounded ? 0 : this.velocity.y;
  }

  /**
   * Returns the smoothed vertical velocity, also on the ground.
   *
   * @returns Meters per second, positive upward.
   */
  getRawVerticalVelocity(): number {
    return this.velocity.y;
  }

  /** @inheritdoc */
  getIsWallPushing(): boolean {
    return this.motion.wallPushing;
  }

  /** @inheritdoc */
  copyWallNormalTo(target: THREE.Vector3): THREE.Vector3 {
    if (!this.motion.wallPushing) return target.set(0, 0, 0);
    return target.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  /** @inheritdoc */
  copyMoveIntentTo(target: THREE.Vector3): THREE.Vector3 {
    this.copyHorizontalVelocityTo(target);
    if (this.getPlanarSpeed() === 0) return target.set(0, 0, 0);
    return target.normalize();
  }

  /** @inheritdoc */
  copyHorizontalVelocityTo(target: THREE.Vector3): THREE.Vector3 {
    return target.set(this.velocity.x, 0, this.velocity.z);
  }
}
