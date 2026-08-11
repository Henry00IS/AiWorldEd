import * as THREE from 'three';
import {
  PLAYER_AIR_ACCELERATION_METERS_PER_SECOND_SQUARED,
  PLAYER_AIR_DECELERATION_METERS_PER_SECOND_SQUARED,
  PLAYER_COYOTE_TIME_SECONDS,
  PLAYER_FACING_TURN_RATE_RADIANS_PER_SECOND,
  PLAYER_GRAVITY_METERS_PER_SECOND_SQUARED,
  PLAYER_GROUND_ACCELERATION_METERS_PER_SECOND_SQUARED,
  PLAYER_GROUND_DECELERATION_METERS_PER_SECOND_SQUARED,
  PLAYER_JUMP_SPEED_METERS_PER_SECOND,
  PLAYER_RUN_SPEED_METERS_PER_SECOND,
} from '@/player/player_constants.js';
import type { PlayerCollisionWorld } from '@/player/collision/player_collision_world.js';
import {
  createPlayerCollisionScratch,
  playerCollisionIntegrateStep,
  type PlayerCollisionScratch,
} from '@/player/collision/player_collision_resolve.js';
import { playerCollisionSolvePose } from '@/player/collision/player_collision_solver.js';
import type { PlayerLookState } from '@/player/look/player_look_state.js';
import {
  playerMovementIsJumpHeld,
  playerMovementReadAxes,
  playerMovementResolveSpeed,
} from './player_movement_input.js';
import type { ManagerInput } from '@/input/manager_input.js';

/** Live play-mode body transform, velocity, and facing. */
export class PlayerBodyState {
  private readonly feetPosition: THREE.Vector3;
  private verticalVelocity: number;
  private isGrounded: boolean;
  private jumpWasHeld: boolean;
  private coyoteTimeRemaining: number;
  /** Seconds remaining where ground snap is forced off after a jump. */
  private groundSnapSuppressionTimeRemaining: number;
  private isWallPushing: boolean;
  private readonly wallNormal: THREE.Vector3;
  private readonly moveIntent: THREE.Vector3;
  private readonly horizontalVelocity: THREE.Vector3;
  private planarSpeed: number;
  private facingYawRadians: number;
  private wantsRun: boolean;
  private readonly horizontalDelta: THREE.Vector3;
  private readonly scratchForward: THREE.Vector3;
  private readonly scratchRight: THREE.Vector3;
  private readonly scratchTargetVelocity: THREE.Vector3;
  private readonly collisionScratch: PlayerCollisionScratch;

  /** Creates a body at the world origin. */
  constructor() {
    this.feetPosition = new THREE.Vector3();
    this.verticalVelocity = 0;
    this.isGrounded = false;
    this.jumpWasHeld = false;
    this.coyoteTimeRemaining = 0;
    this.groundSnapSuppressionTimeRemaining = 0;
    this.isWallPushing = false;
    this.wallNormal = new THREE.Vector3();
    this.moveIntent = new THREE.Vector3();
    this.horizontalVelocity = new THREE.Vector3();
    this.planarSpeed = 0;
    this.facingYawRadians = 0;
    this.wantsRun = false;
    this.horizontalDelta = new THREE.Vector3();
    this.scratchForward = new THREE.Vector3();
    this.scratchRight = new THREE.Vector3();
    this.scratchTargetVelocity = new THREE.Vector3();
    this.collisionScratch = createPlayerCollisionScratch();
  }

  /**
   * Teleports the body to a feet position without snapping to the ground.
   *
   * @param feetPosition World-space feet position.
   * @param world Collision world used to sample grounded state in place.
   * @param jumpKeyCurrentlyHeld True when Space is already held at spawn.
   * @param facingYawRadians Optional initial body facing yaw.
   */
  resetAt(
    feetPosition: THREE.Vector3,
    world: PlayerCollisionWorld,
    jumpKeyCurrentlyHeld: boolean = false,
    facingYawRadians: number = 0,
  ): void {
    this.feetPosition.copy(feetPosition);
    this.verticalVelocity = 0;
    this.jumpWasHeld = jumpKeyCurrentlyHeld;
    this.coyoteTimeRemaining = 0;
    this.groundSnapSuppressionTimeRemaining = 0;
    this.isWallPushing = false;
    this.wallNormal.set(0, 0, 0);
    this.moveIntent.set(0, 0, 0);
    this.horizontalVelocity.set(0, 0, 0);
    this.planarSpeed = 0;
    this.facingYawRadians = facingYawRadians;
    this.wantsRun = false;
    this.isGrounded = sampleGroundedWithoutMoving(world, this.feetPosition, this.collisionScratch);
  }

  /**
   * Returns a live reference to the feet position vector.
   *
   * @returns Feet position.
   */
  getFeetPosition(): THREE.Vector3 {
    return this.feetPosition;
  }

  /**
   * Returns whether the body is currently grounded.
   *
   * @returns True when on a floor.
   */
  getIsGrounded(): boolean {
    return this.isGrounded;
  }

  /**
   * Returns whether the body is pushing into a wall this frame.
   *
   * @returns True while blocked against a wall with move intent.
   */
  getIsWallPushing(): boolean {
    return this.isWallPushing;
  }

  /**
   * Copies the last wall contact normal into the target.
   *
   * @param target Destination vector.
   * @returns The target vector.
   */
  copyWallNormalTo(target: THREE.Vector3): THREE.Vector3 {
    return target.copy(this.wallNormal);
  }

  /**
   * Copies the planar move intent direction into the target.
   *
   * @param target Destination vector.
   * @returns The target vector.
   */
  copyMoveIntentTo(target: THREE.Vector3): THREE.Vector3 {
    return target.copy(this.moveIntent);
  }

  /**
   * Copies the current horizontal velocity into the target.
   *
   * @param target Destination vector.
   * @returns The target vector.
   */
  copyHorizontalVelocityTo(target: THREE.Vector3): THREE.Vector3 {
    return target.copy(this.horizontalVelocity);
  }

  /**
   * Returns horizontal speed in meters per second for animation blending.
   *
   * @returns Planar speed.
   */
  getPlanarSpeed(): number {
    return this.planarSpeed;
  }

  /**
   * Returns vertical velocity for jump/fall animation selection.
   *
   * @returns Vertical velocity meters per second.
   */
  getVerticalVelocity(): number {
    return this.verticalVelocity;
  }

  /**
   * Returns the body facing yaw used by the third-person avatar.
   *
   * @returns Facing yaw in radians.
   */
  getFacingYawRadians(): number {
    return this.facingYawRadians;
  }

  /**
   * Returns whether the player is holding run (Shift) this frame.
   *
   * @returns True while run is requested.
   */
  getWantsRun(): boolean {
    return this.wantsRun;
  }

  /**
   * Advances movement, jump, gravity, facing, and collision for one frame.
   *
   * @param inputManager Shared keyboard input.
   * @param look Look state for camera-relative move basis.
   * @param world Collision world.
   * @param deltaSeconds Frame delta in seconds.
   * @param lockFacingToLookYaw When true, body facing follows camera yaw (FP).
   */
  update(
    inputManager: ManagerInput,
    look: PlayerLookState,
    world: PlayerCollisionWorld,
    deltaSeconds: number,
    lockFacingToLookYaw: boolean = false,
  ): void {
    this.tickCoyoteTime(deltaSeconds);
    this.tickGroundSnapSuppression(deltaSeconds);
    this.applyJumpEdge(inputManager);
    if (!this.isGrounded || this.groundSnapSuppressionTimeRemaining > 0) {
      this.verticalVelocity -= PLAYER_GRAVITY_METERS_PER_SECOND_SQUARED * deltaSeconds;
    }
    this.buildHorizontalMotion(inputManager, look, deltaSeconds);
    const wasStable = this.isGrounded && this.groundSnapSuppressionTimeRemaining <= 0;
    const result = playerCollisionIntegrateStep(
      world,
      this.feetPosition,
      this.horizontalDelta,
      this.verticalVelocity,
      deltaSeconds,
      this.collisionScratch,
      this.moveIntent,
      wasStable,
    );
    this.verticalVelocity = result.verticalVelocity;
    this.isGrounded = result.isGrounded && this.groundSnapSuppressionTimeRemaining <= 0;
    this.isWallPushing = result.isWallPushing;
    this.wallNormal.copy(result.wallNormal);
    this.killHorizontalVelocityIntoWall(result.wallNormal);
    if (this.isGrounded) {
      this.coyoteTimeRemaining = PLAYER_COYOTE_TIME_SECONDS;
      this.verticalVelocity = 0;
    }
    this.planarSpeed = this.horizontalVelocity.length();
    this.updateFacingYaw(look, deltaSeconds, lockFacingToLookYaw);
  }

  /**
   * Counts down the post-jump ground-snap suppression window.
   *
   * @param deltaSeconds Frame delta.
   */
  private tickGroundSnapSuppression(deltaSeconds: number): void {
    if (this.groundSnapSuppressionTimeRemaining <= 0) {
      return;
    }
    this.groundSnapSuppressionTimeRemaining = Math.max(0, this.groundSnapSuppressionTimeRemaining - deltaSeconds);
  }

  /**
   * Removes the into-wall component of planar velocity after wall contact.
   *
   * @param wallNormal Outward wall normal, or zero when no wall.
   */
  private killHorizontalVelocityIntoWall(wallNormal: THREE.Vector3): void {
    if (wallNormal.lengthSq() < 1e-8) {
      return;
    }
    const intoWall = this.horizontalVelocity.dot(wallNormal);
    if (intoWall < 0) {
      this.horizontalVelocity.addScaledVector(wallNormal, -intoWall);
    }
  }

  /**
   * Counts down coyote time while airborne.
   *
   * @param deltaSeconds Frame delta.
   */
  private tickCoyoteTime(deltaSeconds: number): void {
    if (this.isGrounded) {
      return;
    }
    this.coyoteTimeRemaining = Math.max(0, this.coyoteTimeRemaining - deltaSeconds);
  }

  /**
   * Starts a jump on the rising edge of Space while grounded or in coyote time.
   *
   * @param inputManager Shared keyboard input.
   */
  private applyJumpEdge(inputManager: ManagerInput): void {
    const jumpHeld = playerMovementIsJumpHeld(inputManager);
    const canJump = this.isGrounded || this.coyoteTimeRemaining > 0;
    if (jumpHeld && !this.jumpWasHeld && canJump) {
      this.verticalVelocity = PLAYER_JUMP_SPEED_METERS_PER_SECOND;
      this.isGrounded = false;
      this.coyoteTimeRemaining = 0;
      this.groundSnapSuppressionTimeRemaining = 0.1;
    }
    this.jumpWasHeld = jumpHeld;
  }

  /**
   * Builds camera-relative move intent and accelerates planar velocity.
   *
   * @param inputManager Shared keyboard input.
   * @param look Look state for camera yaw basis.
   * @param deltaSeconds Frame delta.
   */
  private buildHorizontalMotion(inputManager: ManagerInput, look: PlayerLookState, deltaSeconds: number): void {
    const axes = playerMovementReadAxes(inputManager);
    const targetSpeed = playerMovementResolveSpeed(inputManager);
    this.wantsRun = targetSpeed >= PLAYER_RUN_SPEED_METERS_PER_SECOND * 0.9;
    look.copyHorizontalForwardTo(this.scratchForward);
    look.copyHorizontalRightTo(this.scratchRight);
    this.moveIntent.set(0, 0, 0);
    this.moveIntent.addScaledVector(this.scratchForward, axes.forward);
    this.moveIntent.addScaledVector(this.scratchRight, axes.right);
    if (this.moveIntent.lengthSq() > 1e-8) {
      this.moveIntent.normalize();
      this.scratchTargetVelocity.copy(this.moveIntent).multiplyScalar(targetSpeed);
    } else {
      this.scratchTargetVelocity.set(0, 0, 0);
    }
    this.accelerateHorizontalVelocity(deltaSeconds);
    this.horizontalDelta.copy(this.horizontalVelocity).multiplyScalar(deltaSeconds);
  }

  /**
   * Accelerates or decelerates planar velocity toward the target velocity.
   *
   * @param deltaSeconds Frame delta.
   */
  private accelerateHorizontalVelocity(deltaSeconds: number): void {
    const hasInput = this.scratchTargetVelocity.lengthSq() > 1e-8;
    const rate = this.resolveAccelerationRate(hasInput);
    const maxStep = rate * deltaSeconds;
    this.scratchForward.subVectors(this.scratchTargetVelocity, this.horizontalVelocity);
    const errorLength = this.scratchForward.length();
    if (errorLength <= maxStep || errorLength < 1e-8) {
      this.horizontalVelocity.copy(this.scratchTargetVelocity);
      return;
    }
    this.horizontalVelocity.addScaledVector(this.scratchForward, maxStep / errorLength);
  }

  /**
   * Picks grounded or air accel/decel based on input presence.
   *
   * @param hasInput True when a move direction is held.
   * @returns Acceleration magnitude in m/s².
   */
  private resolveAccelerationRate(hasInput: boolean): number {
    if (this.isGrounded) {
      return hasInput
        ? PLAYER_GROUND_ACCELERATION_METERS_PER_SECOND_SQUARED
        : PLAYER_GROUND_DECELERATION_METERS_PER_SECOND_SQUARED;
    }
    return hasInput
      ? PLAYER_AIR_ACCELERATION_METERS_PER_SECOND_SQUARED
      : PLAYER_AIR_DECELERATION_METERS_PER_SECOND_SQUARED;
  }

  /**
   * Updates body facing for hybrid third-person or locked first-person.
   *
   * @param look Camera look state.
   * @param deltaSeconds Frame delta.
   * @param lockFacingToLookYaw True in first-person.
   */
  private updateFacingYaw(look: PlayerLookState, deltaSeconds: number, lockFacingToLookYaw: boolean): void {
    if (lockFacingToLookYaw) {
      this.facingYawRadians = look.getYawRadians();
      return;
    }
    const targetYaw = this.resolveHybridFacingTargetYaw();
    this.facingYawRadians = approachAngleRadians(
      this.facingYawRadians,
      targetYaw,
      PLAYER_FACING_TURN_RATE_RADIANS_PER_SECOND * deltaSeconds,
    );
  }

  /**
   * Picks hybrid facing from wall hug, velocity, or move intent.
   *
   * Faces into the wall only while actively wall-pushing (into-wall intent).
   * Mere scrape contact while free-walking faces travel so detaching from the
   * wall does not keep a forced wall-facing pose.
   *
   * @returns Target facing yaw in radians.
   */
  private resolveHybridFacingTargetYaw(): number {
    if (this.isWallPushing && this.wallNormal.lengthSq() > 1e-8) {
      return Math.atan2(-this.wallNormal.x, -this.wallNormal.z);
    }
    if (this.horizontalVelocity.lengthSq() > 0.04) {
      return Math.atan2(this.horizontalVelocity.x, this.horizontalVelocity.z);
    }
    if (this.moveIntent.lengthSq() > 1e-6) {
      return Math.atan2(this.moveIntent.x, this.moveIntent.z);
    }
    return this.facingYawRadians;
  }
}

/**
 * Returns whether a floor is close under the feet without moving the body.
 *
 * @param world Collision world.
 * @param feetPosition Feet position.
 * @param scratch Collision scratch vectors.
 * @returns True when grounded.
 */
function sampleGroundedWithoutMoving(
  world: PlayerCollisionWorld,
  feetPosition: THREE.Vector3,
  scratch: PlayerCollisionScratch,
): boolean {
  return playerCollisionSolvePose(world.getTriangleSoup(), feetPosition, scratch.solver).isGrounded;
}

/**
 * Moves a yaw angle toward a target by at most maxDelta radians.
 *
 * @param current Current yaw.
 * @param target Target yaw.
 * @param maxDelta Maximum absolute step.
 * @returns Updated yaw.
 */
function approachAngleRadians(current: number, target: number, maxDelta: number): number {
  let delta = target - current;
  while (delta > Math.PI) {
    delta -= Math.PI * 2;
  }
  while (delta < -Math.PI) {
    delta += Math.PI * 2;
  }
  if (Math.abs(delta) <= maxDelta) {
    return target;
  }
  return current + Math.sign(delta) * maxDelta;
}
