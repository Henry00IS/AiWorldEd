import * as THREE from 'three';
import {
  PLAYER_COLLISION_MAX_DEPENETRATION_ITERATIONS,
  PLAYER_COLLISION_MIN_VELOCITY_METERS_PER_SECOND,
  PLAYER_STEP_HEIGHT_METERS,
} from '@/player/player_constants.js';
import { playerCapsuleDepenetrate } from './player_capsule_cast.js';
import { playerCollisionSweepAndSlide } from './player_collision_move.js';
import {
  playerCollisionIsGroundSnapSuppressed,
  playerCollisionProbeAndSnapGroundSupport,
  playerCollisionResolveGroundProbeDistance,
  playerCollisionSuppressGroundSnap,
  playerCollisionTickGroundSnapSuppression,
} from './player_collision_ground_probe.js';
import {
  createPlayerCollisionFrameState,
  playerCollisionSupportReportClear,
  playerCollisionSupportReportCopy,
  type PlayerCollisionFrameState,
} from './player_collision_frame_state.js';
import {
  createPlayerCollisionSolverScratch,
  playerCollisionRaycastGroundY,
  playerCollisionSnapToSupport,
  playerCollisionSolvePose,
  type PlayerCollisionSolverScratch,
} from './player_collision_solver.js';
import type { PlayerCollisionWorld } from './player_collision_world.js';
import { playerCollisionWallSupportsHandPush } from './player_collision_wall_hand_height.js';
import type { PlayerTriangleSoup } from './player_triangle_soup.js';

/** Mutable feet pose and vertical velocity after one collision step. */
export interface PlayerCollisionStepResult {
  feetPosition: THREE.Vector3;
  verticalVelocity: number;
  isGrounded: boolean;
  isWallPushing: boolean;
  wallNormal: THREE.Vector3;
  /** True when a step-up seating succeeded this frame. */
  didStepUp: boolean;
}

/** Scratch vectors for collision integration. */
export interface PlayerCollisionScratch {
  frameState: PlayerCollisionFrameState;
  solver: PlayerCollisionSolverScratch;
}

/**
 * Creates a fresh scratch bag for collision integration.
 *
 * @returns Scratch vectors.
 */
export function createPlayerCollisionScratch(): PlayerCollisionScratch {
  return {
    frameState: createPlayerCollisionFrameState(),
    solver: createPlayerCollisionSolverScratch(),
  };
}

/**
 * Integrates one frame of player motion: depenetrate, probe ground, then
 * sweep-and-slide velocity with optional step climbs.
 *
 * @param world Collision world providing the triangle soup.
 * @param feetPosition Current feet position (mutated).
 * @param horizontalDelta Desired horizontal displacement this frame.
 * @param verticalVelocity Current vertical velocity.
 * @param deltaSeconds Frame delta in seconds.
 * @param scratch Scratch vectors reused by the caller pool.
 * @param moveIntent Optional unit planar move intent for wall-push detection.
 * @param wasGroundedPreviousFrame Grounded result from the previous integrate.
 * @returns Updated pose and grounded flag.
 */
export function playerCollisionIntegrateStep(
  world: PlayerCollisionWorld,
  feetPosition: THREE.Vector3,
  horizontalDelta: THREE.Vector3,
  verticalVelocity: number,
  deltaSeconds: number,
  scratch: PlayerCollisionScratch,
  moveIntent: THREE.Vector3 | null = null,
  wasGroundedPreviousFrame: boolean = false,
): PlayerCollisionStepResult {
  const soup = world.getTriangleSoup();
  const frameState = scratch.frameState;
  playerCollisionPrepareFrame(frameState, moveIntent, wasGroundedPreviousFrame, verticalVelocity);
  playerCapsuleDepenetrate(soup, feetPosition, frameState.cast, PLAYER_COLLISION_MAX_DEPENETRATION_ITERATIONS);
  playerCollisionRunGroundPhase(soup, feetPosition, frameState);
  playerCollisionComposeTravelVelocity(frameState, horizontalDelta, verticalVelocity, deltaSeconds);
  playerCollisionExecuteTravelPhase(soup, feetPosition, frameState, deltaSeconds);
  playerCollisionGateWallPushByHandHeight(soup, feetPosition, frameState);
  playerCollisionTickGroundSnapSuppression(frameState, deltaSeconds);
  return playerCollisionBuildStepResult(feetPosition, frameState);
}

/**
 * Clears wall-push when nothing solid exists at hand height.
 *
 * Feet still collide with short barriers; palms only engage when a wall-like
 * surface is present around hand height above standing ground.
 *
 * @param soup Triangle soup used by character collision.
 * @param feetPosition Final feet pose (standing ground Y).
 * @param frameState Frame state with provisional wall-push flags.
 */
function playerCollisionGateWallPushByHandHeight(
  soup: PlayerTriangleSoup,
  feetPosition: THREE.Vector3,
  frameState: PlayerCollisionFrameState,
): void {
  if (!frameState.isWallPushing) {
    return;
  }
  if (playerCollisionWallSupportsHandPush(soup, feetPosition)) {
    return;
  }
  frameState.isWallPushing = false;
}

/**
 * Resets per-frame flags and seeds last-frame ground status.
 *
 * @param frameState Frame state.
 * @param moveIntent Optional move intent.
 * @param wasGroundedPreviousFrame Previous grounded flag.
 * @param verticalVelocity Current vertical velocity.
 */
function playerCollisionPrepareFrame(
  frameState: PlayerCollisionFrameState,
  moveIntent: THREE.Vector3 | null,
  wasGroundedPreviousFrame: boolean,
  verticalVelocity: number,
): void {
  playerCollisionSupportReportCopy(frameState.supportReport, frameState.previousSupportReport);
  if (wasGroundedPreviousFrame && !frameState.previousSupportReport.isWalkableSupport) {
    frameState.previousSupportReport.isWalkableSupport = true;
    frameState.previousSupportReport.hasSupportContact = true;
  }
  playerCollisionSupportReportClear(frameState.supportReport);
  frameState.didStepUpThisFrame = false;
  frameState.isWallPushing = false;
  frameState.wallNormal.set(0, 0, 0);
  frameState.supportContactedWhileMoving = false;
  frameState.moveIntent.copy(moveIntent ?? ZERO_VECTOR);
  if (verticalVelocity > 0.5) {
    playerCollisionSuppressGroundSnap(frameState, 0.1);
  }
}

/**
 * Runs ground probing and snapping before velocity movement.
 *
 * @param soup Triangle soup.
 * @param feetPosition Feet pose.
 * @param frameState Frame state.
 */
function playerCollisionRunGroundPhase(
  soup: ReturnType<PlayerCollisionWorld['getTriangleSoup']>,
  feetPosition: THREE.Vector3,
  frameState: PlayerCollisionFrameState,
): void {
  if (playerCollisionIsGroundSnapSuppressed(frameState)) {
    feetPosition.y += 0.0075;
    return;
  }
  const probeDistance = playerCollisionResolveGroundProbeDistance(frameState);
  playerCollisionProbeAndSnapGroundSupport(soup, feetPosition, probeDistance, frameState);
}

/**
 * Builds 3D travel velocity from planar delta and vertical speed.
 *
 * When seated on walkable support and snap is allowed, zeros vertical speed and
 * orients planar motion onto the support normal.
 *
 * @param frameState Frame state.
 * @param horizontalDelta Planar displacement for this frame.
 * @param verticalVelocity Vertical velocity.
 * @param deltaSeconds Frame delta.
 */
function playerCollisionComposeTravelVelocity(
  frameState: PlayerCollisionFrameState,
  horizontalDelta: THREE.Vector3,
  verticalVelocity: number,
  deltaSeconds: number,
): void {
  const invDt = deltaSeconds > 1e-8 ? 1 / deltaSeconds : 0;
  frameState.travelVelocity.set(horizontalDelta.x * invDt, verticalVelocity, horizontalDelta.z * invDt);
  if (frameState.supportReport.isWalkableSupport && !playerCollisionIsGroundSnapSuppressed(frameState)) {
    frameState.travelVelocity.y = 0;
    if (frameState.travelVelocity.lengthSq() > 1e-12) {
      const speed = Math.hypot(frameState.travelVelocity.x, frameState.travelVelocity.z);
      frameState.remainingDirection.set(frameState.travelVelocity.x, 0, frameState.travelVelocity.z).normalize();
      frameState.travelVelocity.copy(frameState.remainingDirection).multiplyScalar(speed);
      playerCollisionAlignTravelToSupport(frameState);
    }
  }
  if (frameState.travelVelocity.length() < PLAYER_COLLISION_MIN_VELOCITY_METERS_PER_SECOND) {
    frameState.travelVelocity.set(0, 0, 0);
  }
}

/**
 * Reorients planar travel velocity onto the current support surface.
 *
 * @param frameState Frame state with support normal and travel velocity.
 */
function playerCollisionAlignTravelToSupport(frameState: PlayerCollisionFrameState): void {
  const normal = frameState.supportReport.groundNormal;
  if (normal.y < 0.1) {
    return;
  }
  const planar = Math.hypot(frameState.travelVelocity.x, frameState.travelVelocity.z);
  if (planar < 1e-8) {
    return;
  }
  scratchRight.set(frameState.travelVelocity.x, 0, frameState.travelVelocity.z).cross(WORLD_UP);
  if (scratchRight.lengthSq() < 1e-12) {
    return;
  }
  scratchTangent.crossVectors(normal, scratchRight);
  if (scratchTangent.lengthSq() < 1e-12) {
    return;
  }
  scratchTangent.normalize();
  if (scratchTangent.x * frameState.travelVelocity.x + scratchTangent.z * frameState.travelVelocity.z < 0) {
    scratchTangent.multiplyScalar(-1);
  }
  frameState.travelVelocity.copy(scratchTangent).multiplyScalar(planar);
}

/**
 * Runs the travel-velocity sweep phase.
 *
 * @param soup Triangle soup.
 * @param feetPosition Feet pose.
 * @param frameState Frame state.
 * @param deltaSeconds Frame delta.
 */
function playerCollisionExecuteTravelPhase(
  soup: ReturnType<PlayerCollisionWorld['getTriangleSoup']>,
  feetPosition: THREE.Vector3,
  frameState: PlayerCollisionFrameState,
  deltaSeconds: number,
): void {
  playerCollisionSweepAndSlide(soup, feetPosition, frameState.travelVelocity, deltaSeconds, frameState);
  if (!frameState.supportReport.isWalkableSupport && frameState.supportContactedWhileMoving) {
    frameState.supportReport.isWalkableSupport = true;
    frameState.supportReport.hasSupportContact = true;
  }
  if (frameState.didStepUpThisFrame) {
    frameState.supportReport.isWalkableSupport = true;
    frameState.supportReport.hasSupportContact = true;
  }
}

/**
 * Builds the public collision step result from frame state.
 *
 * @param feetPosition Final feet pose.
 * @param frameState Frame state.
 * @returns Step result.
 */
function playerCollisionBuildStepResult(
  feetPosition: THREE.Vector3,
  frameState: PlayerCollisionFrameState,
): PlayerCollisionStepResult {
  const grounded = frameState.supportReport.isWalkableSupport && !playerCollisionIsGroundSnapSuppressed(frameState);
  return {
    feetPosition,
    verticalVelocity: grounded ? 0 : frameState.travelVelocity.y,
    isGrounded: grounded,
    isWallPushing: frameState.isWallPushing && !frameState.didStepUpThisFrame,
    wallNormal: frameState.wallNormal,
    didStepUp: frameState.didStepUpThisFrame,
  };
}

/**
 * Snaps feet down onto nearby ground when a surface is close below.
 *
 * @param world Collision world.
 * @param feetPosition Feet position mutated in place.
 * @param scratch Scratch vectors.
 * @returns True when snapped to ground.
 */
export function playerCollisionSnapToGround(
  world: PlayerCollisionWorld,
  feetPosition: THREE.Vector3,
  scratch: PlayerCollisionScratch,
): boolean {
  const groundY = playerCollisionRaycastGroundY(world, feetPosition, scratch.solver);
  if (groundY === null) {
    return playerCollisionSnapToSupport(
      world,
      world.getTriangleSoup(),
      feetPosition,
      PLAYER_STEP_HEIGHT_METERS + 50,
      scratch.solver,
    );
  }
  feetPosition.y = groundY;
  playerCollisionSolvePose(world.getTriangleSoup(), feetPosition, scratch.solver);
  return true;
}

const ZERO_VECTOR = new THREE.Vector3(0, 0, 0);
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const scratchRight = new THREE.Vector3();
const scratchTangent = new THREE.Vector3();
