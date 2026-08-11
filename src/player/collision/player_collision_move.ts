import * as THREE from 'three';
import {
  PLAYER_COLLISION_MAX_SWEEP_ITERATIONS,
  PLAYER_COLLISION_MIN_VELOCITY_METERS_PER_SECOND,
  PLAYER_COLLISION_SURFACE_OFFSET_METERS,
} from '@/player/player_constants.js';
import { playerCapsuleCast, playerCapsuleDepenetrate } from './player_capsule_cast.js';
import {
  playerCollisionClipVelocityAgainstPlane,
  playerCollisionClassifyImpact,
  playerCollisionExecuteStepSeat,
  playerCollisionIsWallLikeBlocker,
  playerCollisionReorientVelocityOnSupport,
  playerCollisionResolveBlockingNormal,
} from './player_collision_stability.js';
import { playerCollisionIsGroundSnapSuppressed } from './player_collision_ground_probe.js';
import type { PlayerCollisionFrameState } from './player_collision_frame_state.js';
import type { PlayerTriangleSoup } from './player_triangle_soup.js';

/**
 * Moves the character by travel velocity with sweep-and-slide and step climbs.
 *
 * @param soup Triangle soup.
 * @param feetPosition Feet pose mutated in place.
 * @param travelVelocity Travel velocity mutated by projections.
 * @param deltaSeconds Frame delta.
 * @param frameState Frame state.
 */
export function playerCollisionSweepAndSlide(
  soup: PlayerTriangleSoup,
  feetPosition: THREE.Vector3,
  travelVelocity: THREE.Vector3,
  deltaSeconds: number,
  frameState: PlayerCollisionFrameState,
): void {
  if (deltaSeconds <= 0 || travelVelocity.lengthSq() <= 0) {
    return;
  }
  if (travelVelocity.length() < PLAYER_COLLISION_MIN_VELOCITY_METERS_PER_SECOND) {
    travelVelocity.set(0, 0, 0);
    return;
  }
  frameState.remainingVelocity.copy(travelVelocity);
  let remainingMagnitude = frameState.remainingVelocity.length() * deltaSeconds;
  frameState.remainingDirection.copy(frameState.remainingVelocity).normalize();
  let sweepsMade = 0;
  let hitSomething = true;
  frameState.wallNormal.set(0, 0, 0);
  frameState.isWallPushing = false;
  while (remainingMagnitude > 1e-8 && hitSomething && sweepsMade < PLAYER_COLLISION_MAX_SWEEP_ITERATIONS) {
    hitSomething = playerCollisionSweepOnce(soup, feetPosition, remainingMagnitude, frameState);
    if (hitSomething) {
      remainingMagnitude = playerCollisionHandleSweepHit(
        soup,
        feetPosition,
        travelVelocity,
        remainingMagnitude,
        frameState,
      );
    }
    sweepsMade += 1;
  }
  if (!hitSomething && remainingMagnitude > 1e-8) {
    feetPosition.addScaledVector(frameState.remainingDirection, remainingMagnitude);
  }
  playerCapsuleDepenetrate(soup, feetPosition, frameState.cast, 2);
  travelVelocity.copy(frameState.remainingVelocity);
}

/**
 * Performs one capsule sweep along the remaining move direction.
 *
 * @param soup Triangle soup.
 * @param feetPosition Feet pose.
 * @param remainingMagnitude Remaining displacement meters.
 * @param frameState Frame state.
 * @returns True when a hit was found.
 */
function playerCollisionSweepOnce(
  soup: PlayerTriangleSoup,
  feetPosition: THREE.Vector3,
  remainingMagnitude: number,
  frameState: PlayerCollisionFrameState,
): boolean {
  const found = playerCapsuleCast(
    soup,
    feetPosition,
    frameState.remainingDirection,
    remainingMagnitude + PLAYER_COLLISION_SURFACE_OFFSET_METERS,
    frameState.cast,
    frameState.castHit,
  );
  if (!found) {
    return false;
  }
  const travel = Math.max(0, frameState.castHit.distance - PLAYER_COLLISION_SURFACE_OFFSET_METERS);
  feetPosition.addScaledVector(frameState.remainingDirection, travel);
  return true;
}

/**
 * Handles stability, stepping, and velocity projection after a sweep hit.
 *
 * @param soup Triangle soup.
 * @param feetPosition Feet pose mutated on step.
 * @param travelVelocity Full travel velocity (for impact context).
 * @param remainingMagnitude Remaining displacement before this hit.
 * @param frameState Frame state.
 * @returns Updated remaining displacement magnitude.
 */
function playerCollisionHandleSweepHit(
  soup: PlayerTriangleSoup,
  feetPosition: THREE.Vector3,
  travelVelocity: THREE.Vector3,
  remainingMagnitude: number,
  frameState: PlayerCollisionFrameState,
): number {
  const travel = Math.max(0, frameState.castHit.distance - PLAYER_COLLISION_SURFACE_OFFSET_METERS);
  let left = Math.max(0, remainingMagnitude - travel);
  playerCollisionClassifyImpact(
    soup,
    feetPosition,
    frameState.castHit.normal,
    frameState.castHit.point,
    frameState.remainingVelocity,
    frameState,
    frameState.impactReport,
  );
  if (playerCollisionTryStepFromHit(soup, feetPosition, frameState)) {
    return left;
  }
  const stableOnHit = frameState.impactReport.isStable && !playerCollisionIsGroundSnapSuppressed(frameState);
  if (stableOnHit) {
    frameState.supportContactedWhileMoving = true;
  }
  playerCollisionProjectVelocityAfterHit(stableOnHit, frameState);
  playerCollisionRememberWallFromHit(stableOnHit, frameState);
  if (frameState.remainingVelocity.lengthSq() < 1e-12) {
    return 0;
  }
  const factor = frameState.remainingVelocity.length() / Math.max(1e-8, travelVelocity.length());
  left *= Math.min(1, factor);
  frameState.remainingDirection.copy(frameState.remainingVelocity).normalize();
  return left;
}

/**
 * Executes a step when the current hit reported a valid step seat.
 *
 * @param soup Triangle soup.
 * @param feetPosition Feet pose.
 * @param frameState Frame state.
 * @returns True when a step was executed.
 */
function playerCollisionTryStepFromHit(
  soup: PlayerTriangleSoup,
  feetPosition: THREE.Vector3,
  frameState: PlayerCollisionFrameState,
): boolean {
  if (!frameState.impactReport.stepClimbAvailable) {
    return false;
  }
  if (!playerCollisionIsWallLikeBlocker(frameState.castHit.normal)) {
    return false;
  }
  if (
    !playerCollisionExecuteStepSeat(
      soup,
      feetPosition,
      frameState.castHit.normal,
      frameState.remainingVelocity,
      frameState,
    )
  ) {
    return false;
  }
  frameState.didStepUpThisFrame = true;
  frameState.supportContactedWhileMoving = true;
  if (frameState.remainingVelocity.lengthSq() > 1e-12) {
    frameState.remainingDirection.copy(frameState.remainingVelocity).normalize();
  }
  return true;
}

/**
 * Projects remaining velocity after a non-step hit.
 *
 * @param stableOnHit Whether this hit is stable ground.
 * @param frameState Frame state.
 */
function playerCollisionProjectVelocityAfterHit(stableOnHit: boolean, frameState: PlayerCollisionFrameState): void {
  const groundSnapSuppressed = playerCollisionIsGroundSnapSuppressed(frameState);
  const grounded = frameState.supportReport.isWalkableSupport && !groundSnapSuppressed;
  const blockingNormal = playerCollisionResolveBlockingNormal(
    frameState.castHit.normal,
    stableOnHit,
    grounded,
    groundSnapSuppressed,
    frameState.supportReport.groundNormal,
    frameState.stepForward,
  );
  if (grounded) {
    if (stableOnHit) {
      playerCollisionReorientVelocityOnSupport(frameState.remainingVelocity, blockingNormal);
      return;
    }
    playerCollisionClipVelocityAgainstPlane(frameState.remainingVelocity, blockingNormal);
    return;
  }
  if (stableOnHit) {
    frameState.remainingVelocity.y = 0;
    playerCollisionReorientVelocityOnSupport(frameState.remainingVelocity, blockingNormal);
    return;
  }
  playerCollisionClipVelocityAgainstPlane(frameState.remainingVelocity, blockingNormal);
}

/**
 * Records wall-push state from an unstable blocking hit.
 *
 * @param stableOnHit Whether the hit was stable ground.
 * @param frameState Frame state.
 */
function playerCollisionRememberWallFromHit(stableOnHit: boolean, frameState: PlayerCollisionFrameState): void {
  if (stableOnHit || frameState.didStepUpThisFrame) {
    return;
  }
  if (!playerCollisionIsWallLikeBlocker(frameState.castHit.normal)) {
    return;
  }
  if (frameState.impactReport.stepClimbAvailable) {
    return;
  }
  frameState.wallNormal.set(frameState.castHit.normal.x, 0, frameState.castHit.normal.z);
  if (frameState.wallNormal.lengthSq() < 1e-10) {
    return;
  }
  frameState.wallNormal.normalize();
  if (frameState.moveIntent.lengthSq() > 1e-8 && frameState.moveIntent.dot(frameState.wallNormal) < -0.35) {
    frameState.isWallPushing = true;
  }
}
