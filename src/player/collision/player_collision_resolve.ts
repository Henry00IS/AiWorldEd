import * as THREE from 'three';
import {
  PLAYER_CHARACTER_SNAP_TO_GROUND_METERS,
  PLAYER_COLLIDER_HEIGHT_METERS,
  PLAYER_COLLIDER_RADIUS_METERS,
  PLAYER_GROUND_STICK_METERS,
  PLAYER_JUMP_SNAP_SUPPRESSION_SPEED_METERS_PER_SECOND,
  PLAYER_MIN_WALKABLE_NORMAL_Y,
} from '@/player/player_constants.js';
import type { PhysicsLevelWorld } from '@/physics/level/physics_level_world.js';
import type { PlayerCollisionCharacterRig } from './player_collision_character_rig.js';
import { playerCollisionDepenetrate, playerCollisionPoseIsFree } from './player_collision_depenetration.js';
import { playerCollisionSampleGround } from './player_collision_ground_sample.js';
import type { PlayerCollisionWorld } from './player_collision_world.js';
import { playerCollisionWallSupportsHandPush } from './player_collision_wall_hand_height.js';

/** Mutable feet pose and vertical velocity after one collision step. */
export interface PlayerCollisionStepResult {
  feetPosition: THREE.Vector3;
  verticalVelocity: number;
  isGrounded: boolean;
  isWallPushing: boolean;
  wallNormal: THREE.Vector3;
  /** True when the controller climbed a step this frame. */
  didStepUp: boolean;
  /** True when the feet were pushed or lifted out of geometry this frame. */
  wasDepenetrated: boolean;
}

/** Per-body collision memory reused between frames. */
export interface PlayerCollisionScratch {
  result: PlayerCollisionStepResult;
  desiredTranslation: THREE.Vector3;
  lastSafeFeet: THREE.Vector3;
  hasLastSafeFeet: boolean;
  changedBounds: THREE.Box3;
  bodyBounds: THREE.Box3;
}

/** Normal Y below which a contact counts as a ceiling. */
const PLAYER_CEILING_NORMAL_Y_MAX = -0.3;

/** Absolute normal Y below which a contact counts as a wall. */
const PLAYER_WALL_NORMAL_Y_MAX = 0.3;

/** Rise in one grounded frame that counts as climbing a step. */
const PLAYER_STEP_UP_MIN_RISE_METERS = 0.02;

/**
 * Creates a fresh scratch bag for collision integration.
 *
 * @returns Scratch state.
 */
export function createPlayerCollisionScratch(): PlayerCollisionScratch {
  return {
    result: {
      feetPosition: new THREE.Vector3(),
      verticalVelocity: 0,
      isGrounded: false,
      isWallPushing: false,
      wallNormal: new THREE.Vector3(),
      didStepUp: false,
      wasDepenetrated: false,
    },
    desiredTranslation: new THREE.Vector3(),
    lastSafeFeet: new THREE.Vector3(),
    hasLastSafeFeet: false,
    changedBounds: new THREE.Box3(),
    bodyBounds: new THREE.Box3(),
  };
}

/**
 * Integrates one frame of player motion with the Rapier character controller:
 * recover from geometry that appeared on the body, then move with sliding,
 * auto-stepping and ground snapping, then classify ground, walls and ceilings.
 *
 * @param world Collision world.
 * @param feetPosition Current feet position (mutated).
 * @param horizontalDelta Desired horizontal displacement this frame.
 * @param verticalVelocity Current vertical velocity.
 * @param deltaSeconds Frame delta in seconds.
 * @param scratch Per-body scratch state.
 * @param moveIntent Optional unit planar move intent for wall-push detection.
 * @param wasGroundedPreviousFrame Grounded result from the previous integrate.
 * @returns Updated pose and contact flags (reused object).
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
  const result = playerCollisionResetResult(scratch, feetPosition);
  const rig = world.getCharacterRig();
  const levelWorld = world.syncLevelWorld();
  if (!rig || !levelWorld) {
    result.isGrounded = wasGroundedPreviousFrame;
    return result;
  }
  result.wasDepenetrated = playerCollisionRecoverFromEdits(world, levelWorld, rig, feetPosition, scratch);
  const snapToGround =
    wasGroundedPreviousFrame && verticalVelocity <= PLAYER_JUMP_SNAP_SUPPRESSION_SPEED_METERS_PER_SECOND;
  if (snapToGround) {
    playerCollisionMoveGrounded(
      world,
      rig,
      feetPosition,
      horizontalDelta,
      verticalVelocity * deltaSeconds,
      scratch,
      moveIntent,
    );
  } else {
    playerCollisionMoveAirborne(
      rig,
      feetPosition,
      horizontalDelta,
      verticalVelocity,
      deltaSeconds,
      scratch,
      moveIntent,
    );
  }
  playerCollisionGateWallPushByHandHeight(world, feetPosition, result);
  playerCollisionRememberSafeFeet(feetPosition, scratch);
  return result;
}

/**
 * Clears the reusable result for a new frame.
 *
 * @param scratch Per-body scratch.
 * @param feetPosition Feet position the result refers to.
 * @returns The cleared result.
 */
function playerCollisionResetResult(
  scratch: PlayerCollisionScratch,
  feetPosition: THREE.Vector3,
): PlayerCollisionStepResult {
  const result = scratch.result;
  result.feetPosition = feetPosition;
  result.verticalVelocity = 0;
  result.isGrounded = false;
  result.isWallPushing = false;
  result.wallNormal.set(0, 0, 0);
  result.didStepUp = false;
  result.wasDepenetrated = false;
  return result;
}

/**
 * Pushes the body out of geometry that changed onto it since the last frame,
 * falling back to the last safe pose when no free pose is found nearby.
 *
 * @param world Collision world (source of changed bounds).
 * @param levelWorld Level world.
 * @param rig Character rig.
 * @param feetPosition Feet position (mutated).
 * @param scratch Per-body scratch.
 * @returns True when the feet were moved.
 */
function playerCollisionRecoverFromEdits(
  world: PlayerCollisionWorld,
  levelWorld: PhysicsLevelWorld,
  rig: PlayerCollisionCharacterRig,
  feetPosition: THREE.Vector3,
  scratch: PlayerCollisionScratch,
): boolean {
  const editTouchedBody = playerCollisionChangedBoundsTouchBody(world, feetPosition, scratch);
  const outcome = playerCollisionDepenetrate(levelWorld, rig, feetPosition, editTouchedBody);
  if (outcome === 'stuck') {
    return playerCollisionRestoreSafeFeet(levelWorld, rig, feetPosition, scratch);
  }
  return outcome !== 'free';
}

/**
 * Returns whether geometry changed near the body since the last frame.
 *
 * @param world Collision world.
 * @param feetPosition Feet position.
 * @param scratch Per-body scratch.
 * @returns True when the changed bounds overlap the body bounds.
 */
function playerCollisionChangedBoundsTouchBody(
  world: PlayerCollisionWorld,
  feetPosition: THREE.Vector3,
  scratch: PlayerCollisionScratch,
): boolean {
  world.takeChangedBounds(scratch.changedBounds);
  if (scratch.changedBounds.isEmpty()) {
    return false;
  }
  const margin = PLAYER_COLLIDER_RADIUS_METERS + 0.1;
  scratch.bodyBounds.min.set(feetPosition.x - margin, feetPosition.y - 0.1, feetPosition.z - margin);
  scratch.bodyBounds.max.set(
    feetPosition.x + margin,
    feetPosition.y + PLAYER_COLLIDER_HEIGHT_METERS + 0.1,
    feetPosition.z + margin,
  );
  return scratch.changedBounds.intersectsBox(scratch.bodyBounds);
}

/**
 * Moves the feet back to the last safe pose when that pose is free.
 *
 * @param levelWorld Level world.
 * @param rig Character rig.
 * @param feetPosition Feet position (mutated).
 * @param scratch Per-body scratch.
 * @returns True when the feet were restored.
 */
function playerCollisionRestoreSafeFeet(
  levelWorld: PhysicsLevelWorld,
  rig: PlayerCollisionCharacterRig,
  feetPosition: THREE.Vector3,
  scratch: PlayerCollisionScratch,
): boolean {
  if (!scratch.hasLastSafeFeet || !playerCollisionPoseIsFree(levelWorld, rig, scratch.lastSafeFeet)) {
    return false;
  }
  feetPosition.copy(scratch.lastSafeFeet);
  return true;
}

/**
 * Moves a body that stood on ground last frame: one controller move with
 * auto-stepping and snapping, then a manual snap down when the controller lost
 * the ground (micro gaps, stair descents).
 *
 * @param world Collision world.
 * @param rig Character rig.
 * @param feetPosition Feet position (mutated).
 * @param horizontalDelta Planar displacement.
 * @param verticalDelta Vertical displacement from vertical velocity.
 * @param scratch Per-body scratch.
 * @param moveIntent Planar move intent, or null.
 */
function playerCollisionMoveGrounded(
  world: PlayerCollisionWorld,
  rig: PlayerCollisionCharacterRig,
  feetPosition: THREE.Vector3,
  horizontalDelta: THREE.Vector3,
  verticalDelta: number,
  scratch: PlayerCollisionScratch,
  moveIntent: THREE.Vector3 | null,
): void {
  const result = scratch.result;
  scratch.desiredTranslation.set(
    horizontalDelta.x,
    Math.min(verticalDelta, -PLAYER_GROUND_STICK_METERS),
    horizontalDelta.z,
  );
  const startY = feetPosition.y;
  feetPosition.add(rig.move(feetPosition, scratch.desiredTranslation, true));
  playerCollisionClassifyWall(rig, result, moveIntent);
  result.isGrounded = rig.wasLastMoveGrounded() || playerCollisionSnapDownOntoGround(world, feetPosition);
  result.didStepUp = result.isGrounded && feetPosition.y - startY > PLAYER_STEP_UP_MIN_RISE_METERS;
  if (result.didStepUp) {
    result.isWallPushing = false;
  }
  result.verticalVelocity = 0;
}

/**
 * Drops the feet onto walkable ground within the snap distance.
 *
 * @param world Collision world.
 * @param feetPosition Feet position (mutated on success).
 * @returns True when the feet were snapped onto ground.
 */
function playerCollisionSnapDownOntoGround(world: PlayerCollisionWorld, feetPosition: THREE.Vector3): boolean {
  const hit = playerCollisionSampleGround(world, feetPosition, PLAYER_CHARACTER_SNAP_TO_GROUND_METERS);
  if (!hit || hit.normal.y < PLAYER_MIN_WALKABLE_NORMAL_Y) {
    return false;
  }
  feetPosition.y -= hit.distance;
  return true;
}

/**
 * Moves an airborne body: a horizontal controller move (which may still
 * auto-step when the feet rest on something), then a separate vertical move
 * that lands on floors or bumps ceilings.
 *
 * @param rig Character rig.
 * @param feetPosition Feet position (mutated).
 * @param horizontalDelta Planar displacement.
 * @param verticalVelocity Vertical velocity.
 * @param deltaSeconds Frame delta.
 * @param scratch Per-body scratch.
 * @param moveIntent Planar move intent, or null.
 */
function playerCollisionMoveAirborne(
  rig: PlayerCollisionCharacterRig,
  feetPosition: THREE.Vector3,
  horizontalDelta: THREE.Vector3,
  verticalVelocity: number,
  deltaSeconds: number,
  scratch: PlayerCollisionScratch,
  moveIntent: THREE.Vector3 | null,
): void {
  const result = scratch.result;
  scratch.desiredTranslation.set(horizontalDelta.x, 0, horizontalDelta.z);
  feetPosition.add(rig.move(feetPosition, scratch.desiredTranslation, false));
  playerCollisionClassifyWall(rig, result, moveIntent);
  const desiredY = verticalVelocity * deltaSeconds;
  scratch.desiredTranslation.set(0, desiredY, 0);
  const movementY = rig.move(feetPosition, scratch.desiredTranslation, false).y;
  feetPosition.y += movementY;
  const landed =
    desiredY <= 0 &&
    (rig.wasLastMoveGrounded() || (movementY > desiredY + 1e-4 && playerCollisionTouchedWalkable(rig)));
  const hitCeiling = desiredY > 0 && movementY < desiredY - 1e-4 && playerCollisionTouchedCeiling(rig);
  result.isGrounded = landed;
  result.verticalVelocity = landed ? 0 : hitCeiling ? Math.min(0, verticalVelocity) : verticalVelocity;
}

/**
 * Returns whether the last move touched a walkable floor.
 *
 * @param rig Character rig.
 * @returns True when a contact normal points up enough to stand on.
 */
function playerCollisionTouchedWalkable(rig: PlayerCollisionCharacterRig): boolean {
  const collisions = rig.getLastCollisions();
  for (let index = 0; index < rig.getLastCollisionCount(); index++) {
    if ((collisions[index]?.normal.y ?? 0) >= PLAYER_MIN_WALKABLE_NORMAL_Y) {
      return true;
    }
  }
  return false;
}

/**
 * Returns whether the last move hit a ceiling.
 *
 * @param rig Character rig.
 * @returns True when a contact normal points down.
 */
function playerCollisionTouchedCeiling(rig: PlayerCollisionCharacterRig): boolean {
  const collisions = rig.getLastCollisions();
  for (let index = 0; index < rig.getLastCollisionCount(); index++) {
    if ((collisions[index]?.normal.y ?? 0) <= PLAYER_CEILING_NORMAL_Y_MAX) {
      return true;
    }
  }
  return false;
}

/**
 * Picks the wall contact that opposes the move intent most and flags wall push
 * when the intent drives into it.
 *
 * @param rig Character rig.
 * @param result Step result receiving wall state.
 * @param moveIntent Planar move intent, or null.
 */
function playerCollisionClassifyWall(
  rig: PlayerCollisionCharacterRig,
  result: PlayerCollisionStepResult,
  moveIntent: THREE.Vector3 | null,
): void {
  let bestFacing = Infinity;
  const collisions = rig.getLastCollisions();
  for (let index = 0; index < rig.getLastCollisionCount(); index++) {
    const normal = collisions[index]?.normal;
    if (!normal || Math.abs(normal.y) > PLAYER_WALL_NORMAL_Y_MAX) {
      continue;
    }
    scratchWallNormal.set(normal.x, 0, normal.z).normalize();
    const facing = moveIntent ? scratchWallNormal.dot(moveIntent) : 0;
    if (facing < bestFacing) {
      bestFacing = facing;
      result.wallNormal.copy(scratchWallNormal);
    }
  }
  result.isWallPushing = bestFacing < -0.35;
}

/**
 * Clears wall-push when nothing solid exists at hand height.
 *
 * @param world Collision world.
 * @param feetPosition Final feet pose.
 * @param result Step result with provisional wall-push.
 */
function playerCollisionGateWallPushByHandHeight(
  world: PlayerCollisionWorld,
  feetPosition: THREE.Vector3,
  result: PlayerCollisionStepResult,
): void {
  if (result.isWallPushing && !playerCollisionWallSupportsHandPush(world, feetPosition)) {
    result.isWallPushing = false;
  }
}

/**
 * Records the feet as the last safe pose while standing on ground.
 *
 * @param feetPosition Final feet pose.
 * @param scratch Per-body scratch.
 */
function playerCollisionRememberSafeFeet(feetPosition: THREE.Vector3, scratch: PlayerCollisionScratch): void {
  if (!scratch.result.isGrounded || scratch.result.wasDepenetrated) {
    return;
  }
  scratch.lastSafeFeet.copy(feetPosition);
  scratch.hasLastSafeFeet = true;
}

/**
 * Pushes a pose out of overlapping geometry without moving it otherwise.
 *
 * @param world Collision world.
 * @param feetPosition Feet position (mutated).
 * @returns True when the pose stands on walkable ground afterwards.
 */
export function playerCollisionSettlePose(world: PlayerCollisionWorld, feetPosition: THREE.Vector3): boolean {
  const rig = world.getCharacterRig();
  const levelWorld = world.syncLevelWorld();
  if (!rig || !levelWorld) {
    return false;
  }
  playerCollisionDepenetrate(levelWorld, rig, feetPosition, false);
  return playerCollisionIsStandingOnGround(world, feetPosition);
}

/**
 * Returns whether walkable ground is directly under the feet.
 *
 * @param world Collision world.
 * @param feetPosition Feet position.
 * @returns True when grounded in place.
 */
export function playerCollisionIsStandingOnGround(world: PlayerCollisionWorld, feetPosition: THREE.Vector3): boolean {
  const hit = playerCollisionSampleGround(world, feetPosition, PLAYER_GROUND_STICK_METERS * 3);
  return hit !== null && hit.normal.y >= PLAYER_MIN_WALKABLE_NORMAL_Y;
}

/**
 * Drops the feet onto the ground below (within a long reach).
 *
 * @param world Collision world.
 * @param feetPosition Feet position mutated in place.
 * @returns True when snapped to ground.
 */
export function playerCollisionSnapToGround(world: PlayerCollisionWorld, feetPosition: THREE.Vector3): boolean {
  playerCollisionSettlePose(world, feetPosition);
  const hit = playerCollisionSampleGround(world, feetPosition, 50);
  if (!hit) {
    return false;
  }
  feetPosition.y -= hit.distance;
  return true;
}

const scratchWallNormal = new THREE.Vector3();
