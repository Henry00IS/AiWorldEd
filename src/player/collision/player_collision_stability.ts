import * as THREE from 'three';
import {
  PLAYER_COLLIDER_RADIUS_METERS,
  PLAYER_COLLISION_SURFACE_OFFSET_METERS,
  PLAYER_MIN_WALKABLE_NORMAL_Y,
  PLAYER_STEP_FORWARD_DISTANCE_METERS,
  PLAYER_STEP_HEIGHT_METERS,
  PLAYER_STEP_MIN_REQUIRED_DEPTH_METERS,
  PLAYER_STEP_MIN_RISE_METERS,
  PLAYER_WALL_BLOCKER_NORMAL_Y_MAX,
} from '@/player/player_constants.js';
import { playerCapsuleCast, playerCapsuleOverlaps } from './player_capsule_cast.js';
import type { PlayerCollisionFrameState, PlayerCollisionImpactReport } from './player_collision_frame_state.js';
import type { PlayerTriangleSoup } from './player_triangle_soup.js';

const WORLD_UP = new THREE.Vector3(0, 1, 0);

/**
 * Returns whether a surface normal is walkable support for the player.
 *
 * @param normal Unit world normal.
 * @returns True when the slope is within the configured walkable limit.
 */
export function playerCollisionNormalIsStableSupport(normal: THREE.Vector3): boolean {
  return normal.y >= PLAYER_MIN_WALKABLE_NORMAL_Y;
}

/**
 * Classifies a hit as stable support and checks for a climbable step seat.
 *
 * @param soup Triangle soup.
 * @param feetPosition Character feet at the hit.
 * @param hitNormal Hit normal.
 * @param hitPoint Hit point.
 * @param velocity Character velocity at evaluation time.
 * @param frameState Frame state.
 * @param report Destination stability record.
 */
export function playerCollisionClassifyImpact(
  soup: PlayerTriangleSoup,
  feetPosition: THREE.Vector3,
  hitNormal: THREE.Vector3,
  hitPoint: THREE.Vector3,
  velocity: THREE.Vector3,
  frameState: PlayerCollisionFrameState,
  report: PlayerCollisionImpactReport,
): void {
  report.isStable = playerCollisionNormalIsStableSupport(hitNormal);
  report.stepClimbAvailable = false;
  if (report.isStable) {
    return;
  }
  if (!playerCollisionIsWallLikeBlocker(hitNormal)) {
    return;
  }
  playerCollisionDetectStepSeat(soup, feetPosition, hitPoint, hitNormal, velocity, frameState, report);
  if (report.stepClimbAvailable) {
    report.isStable = true;
  }
}

/**
 * Returns whether a hit normal is wall-like enough to block planar motion.
 *
 * @param hitNormal Hit normal.
 * @returns True when the hit is a near-vertical wall blocker.
 */
export function playerCollisionIsWallLikeBlocker(hitNormal: THREE.Vector3): boolean {
  return Math.abs(hitNormal.y) <= 1 - PLAYER_WALL_BLOCKER_NORMAL_Y_MAX;
}

/**
 * Looks for a valid step seat above an unstable wall hit.
 *
 * @param soup Triangle soup.
 * @param feetPosition Character feet.
 * @param hitPoint Hit point on the wall blocker.
 * @param hitNormal Outward hit normal.
 * @param velocity Character velocity.
 * @param frameState Frame state.
 * @param report Stability record mutated when a step is valid.
 */
function playerCollisionDetectStepSeat(
  soup: PlayerTriangleSoup,
  feetPosition: THREE.Vector3,
  hitPoint: THREE.Vector3,
  hitNormal: THREE.Vector3,
  velocity: THREE.Vector3,
  frameState: PlayerCollisionFrameState,
  report: PlayerCollisionImpactReport,
): void {
  if (!playerCollisionBuildStepForwardDirection(hitNormal, velocity, frameState.stepForward)) {
    return;
  }
  if (playerCollisionCheckStepFromHitPoint(soup, feetPosition, hitPoint, frameState.stepForward, frameState)) {
    report.stepClimbAvailable = true;
    return;
  }
  const minDepth = Math.min(PLAYER_STEP_MIN_REQUIRED_DEPTH_METERS, PLAYER_COLLIDER_RADIUS_METERS);
  frameState.sampleFeet.copy(feetPosition).addScaledVector(frameState.stepForward, minDepth);
  frameState.sampleFeet.y = feetPosition.y + PLAYER_STEP_HEIGHT_METERS;
  if (playerCollisionCheckStepCastDown(soup, feetPosition, frameState.sampleFeet, frameState)) {
    report.stepClimbAvailable = true;
  }
}

/**
 * Builds the planar step-forward direction into the wall blocker.
 *
 * @param hitNormal Outward wall normal.
 * @param velocity Fallback velocity direction.
 * @param target Destination unit planar direction.
 * @returns True when a direction was written.
 */
export function playerCollisionBuildStepForwardDirection(
  hitNormal: THREE.Vector3,
  velocity: THREE.Vector3,
  target: THREE.Vector3,
): boolean {
  target.set(-hitNormal.x, 0, -hitNormal.z);
  if (target.lengthSq() > 1e-10) {
    target.normalize();
    return true;
  }
  target.set(velocity.x, 0, velocity.z);
  if (target.lengthSq() < 1e-12) {
    target.set(0, 0, 0);
    return false;
  }
  target.normalize();
  return true;
}

/**
 * Validates a step cast from the hit point raised by step height.
 *
 * @param soup Triangle soup.
 * @param feetPosition Character feet.
 * @param hitPoint Hit point.
 * @param stepForward Into-riser direction.
 * @param frameState Frame state.
 * @returns True when the step seat is free and stable.
 */
function playerCollisionCheckStepFromHitPoint(
  soup: PlayerTriangleSoup,
  feetPosition: THREE.Vector3,
  hitPoint: THREE.Vector3,
  stepForward: THREE.Vector3,
  frameState: PlayerCollisionFrameState,
): boolean {
  frameState.sampleFeet.set(
    hitPoint.x + stepForward.x * PLAYER_COLLISION_SURFACE_OFFSET_METERS * 3,
    feetPosition.y + PLAYER_STEP_HEIGHT_METERS,
    hitPoint.z + stepForward.z * PLAYER_COLLISION_SURFACE_OFFSET_METERS * 3,
  );
  return playerCollisionCheckStepCastDown(soup, feetPosition, frameState.sampleFeet, frameState);
}

/**
 * Casts down from a raised pose and validates a single tread seat.
 *
 * @param soup Triangle soup.
 * @param feetPosition Character feet before the step.
 * @param castStart Raised cast origin feet pose.
 * @param frameState Frame state.
 * @returns True when a valid tread is found without a blocking solid.
 */
function playerCollisionCheckStepCastDown(
  soup: PlayerTriangleSoup,
  feetPosition: THREE.Vector3,
  castStart: THREE.Vector3,
  frameState: PlayerCollisionFrameState,
): boolean {
  const found = playerCapsuleCast(
    soup,
    castStart,
    WORLD_DOWN,
    PLAYER_STEP_HEIGHT_METERS + PLAYER_COLLISION_SURFACE_OFFSET_METERS,
    frameState.cast,
    frameState.stepHit,
  );
  if (!found) {
    return false;
  }
  const landingY = castStart.y - frameState.stepHit.distance;
  if (landingY < feetPosition.y + PLAYER_STEP_MIN_RISE_METERS) {
    return false;
  }
  if (landingY - feetPosition.y > PLAYER_STEP_HEIGHT_METERS + 1e-3) {
    return false;
  }
  if (!playerCollisionNormalIsStableSupport(frameState.stepHit.normal)) {
    return false;
  }
  frameState.sampleFeet.set(castStart.x, landingY + PLAYER_COLLISION_SURFACE_OFFSET_METERS, castStart.z);
  if (playerCapsuleOverlaps(soup, frameState.sampleFeet, frameState.cast, 0)) {
    return false;
  }
  return true;
}

/**
 * Seats the capsule on a validated step tread during movement.
 *
 * @param soup Triangle soup.
 * @param feetPosition Feet pose mutated on success.
 * @param hitNormal Blocking wall normal.
 * @param velocity Velocity mutated when the step succeeds.
 * @param frameState Frame state.
 * @returns True when the character was seated on the tread.
 */
export function playerCollisionExecuteStepSeat(
  soup: PlayerTriangleSoup,
  feetPosition: THREE.Vector3,
  hitNormal: THREE.Vector3,
  velocity: THREE.Vector3,
  frameState: PlayerCollisionFrameState,
): boolean {
  if (!playerCollisionBuildStepForwardDirection(hitNormal, velocity, frameState.stepForward)) {
    return false;
  }
  frameState.sampleFeet.copy(feetPosition).addScaledVector(frameState.stepForward, PLAYER_STEP_FORWARD_DISTANCE_METERS);
  frameState.sampleFeet.y = feetPosition.y + PLAYER_STEP_HEIGHT_METERS;
  const found = playerCapsuleCast(
    soup,
    frameState.sampleFeet,
    WORLD_DOWN,
    PLAYER_STEP_HEIGHT_METERS,
    frameState.cast,
    frameState.stepHit,
  );
  if (!found || !playerCollisionNormalIsStableSupport(frameState.stepHit.normal)) {
    return false;
  }
  const landingY = frameState.sampleFeet.y - frameState.stepHit.distance + PLAYER_COLLISION_SURFACE_OFFSET_METERS;
  if (landingY < feetPosition.y + PLAYER_STEP_MIN_RISE_METERS) {
    return false;
  }
  if (landingY - feetPosition.y > PLAYER_STEP_HEIGHT_METERS + 0.05) {
    return false;
  }
  feetPosition.x = frameState.sampleFeet.x;
  feetPosition.y = landingY;
  feetPosition.z = frameState.sampleFeet.z;
  if (playerCapsuleOverlaps(soup, feetPosition, frameState.cast, 0)) {
    return false;
  }
  velocity.y = 0;
  return true;
}

/**
 * Reorients velocity to lie on a walkable surface while preserving magnitude.
 *
 * @param velocity Velocity mutated in place.
 * @param surfaceNormal Walkable surface normal.
 */
export function playerCollisionReorientVelocityOnSupport(velocity: THREE.Vector3, surfaceNormal: THREE.Vector3): void {
  const magnitude = velocity.length();
  if (magnitude < 1e-8) {
    velocity.set(0, 0, 0);
    return;
  }
  const right = scratchRight.crossVectors(velocity, WORLD_UP);
  if (right.lengthSq() < 1e-12) {
    velocity.projectOnPlane(surfaceNormal);
    if (velocity.lengthSq() > 1e-12) {
      velocity.normalize().multiplyScalar(magnitude);
    }
    return;
  }
  scratchTangent.crossVectors(surfaceNormal, right).normalize();
  if (scratchTangent.dot(velocity) < 0) {
    scratchTangent.multiplyScalar(-1);
  }
  velocity.copy(scratchTangent).multiplyScalar(magnitude);
}

/**
 * Removes the into-plane component of velocity against a blocking plane.
 *
 * @param velocity Velocity mutated in place.
 * @param blockingNormal Unit plane normal to slide against.
 */
export function playerCollisionClipVelocityAgainstPlane(velocity: THREE.Vector3, blockingNormal: THREE.Vector3): void {
  velocity.projectOnPlane(blockingNormal);
}

/**
 * Builds the effective blocking normal for grounded wall slides.
 *
 * @param hitNormal Raw hit normal.
 * @param stableOnHit Whether the hit itself is stable ground.
 * @param isWalkableSupport Whether the body is currently grounded.
 * @param groundSnapSuppressed Whether ground snap is suppressed.
 * @param groundNormal Current ground normal.
 * @param target Destination normal.
 * @returns The target normal.
 */
export function playerCollisionResolveBlockingNormal(
  hitNormal: THREE.Vector3,
  stableOnHit: boolean,
  isWalkableSupport: boolean,
  groundSnapSuppressed: boolean,
  groundNormal: THREE.Vector3,
  target: THREE.Vector3,
): THREE.Vector3 {
  target.copy(hitNormal);
  if (!isWalkableSupport || groundSnapSuppressed || stableOnHit) {
    return target;
  }
  scratchRight.crossVectors(groundNormal, hitNormal);
  if (scratchRight.lengthSq() < 1e-12) {
    return target;
  }
  scratchRight.normalize();
  scratchTangent.crossVectors(scratchRight, WORLD_UP);
  if (scratchTangent.lengthSq() < 1e-12) {
    return target;
  }
  return target.copy(scratchTangent).normalize();
}

const WORLD_DOWN = new THREE.Vector3(0, -1, 0);
const scratchRight = new THREE.Vector3();
const scratchTangent = new THREE.Vector3();
