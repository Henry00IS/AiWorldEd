import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-deterministic-compat';
import { PHYSICS_LEVEL_GROUPS_LEVEL_QUERY } from '@/physics/level/physics_level_collision_groups.js';
import type { PhysicsLevelWorld } from '@/physics/level/physics_level_world.js';
import {
  PLAYER_CHARACTER_CONTROLLER_OFFSET_METERS,
  PLAYER_DEPENETRATION_MAX_PASSES,
  PLAYER_ESCAPE_SEARCH_MAX_LIFT_METERS,
  PLAYER_ESCAPE_SEARCH_STEP_METERS,
} from '@/player/player_constants.js';
import {
  PLAYER_CAPSULE_CENTER_ABOVE_FEET_METERS,
  type PlayerCollisionCharacterRig,
} from './player_collision_character_rig.js';

/** Penetration depth below which the capsule counts as free. */
const PLAYER_DEPENETRATION_TOLERANCE_METERS = 0.002;

/** How a depenetration attempt ended. */
export type PlayerDepenetrationOutcome = 'free' | 'pushed' | 'lifted' | 'stuck';

const IDENTITY_ROTATION = { x: 0, y: 0, z: 0, w: 1 };
const scratchCenter = { x: 0, y: 0, z: 0 };
const scratchPush = new THREE.Vector3();
const scratchProbeFeet = new THREE.Vector3();

/** Deepest contact found in one overlap pass. */
interface PlayerDeepestContact {
  depth: number;
  normal: THREE.Vector3;
}

const deepestContact: PlayerDeepestContact = { depth: 0, normal: new THREE.Vector3() };

/**
 * Pushes the capsule out of overlapping level geometry along contact normals,
 * then lifts it out of anything it is still buried in.
 *
 * @param levelWorld Level world.
 * @param rig Character rig with the capsule shape.
 * @param feetPosition Feet position (mutated).
 * @param allowLift True to search upward when pushing alone does not free it.
 * @returns What happened.
 */
export function playerCollisionDepenetrate(
  levelWorld: PhysicsLevelWorld,
  rig: PlayerCollisionCharacterRig,
  feetPosition: THREE.Vector3,
  allowLift: boolean,
): PlayerDepenetrationOutcome {
  let wasPushed = false;
  for (let pass = 0; pass < PLAYER_DEPENETRATION_MAX_PASSES; pass++) {
    if (!playerCollisionFindDeepestContact(levelWorld, rig, feetPosition)) {
      return wasPushed ? 'pushed' : 'free';
    }
    scratchPush
      .copy(deepestContact.normal)
      .multiplyScalar(deepestContact.depth + PLAYER_CHARACTER_CONTROLLER_OFFSET_METERS);
    feetPosition.add(scratchPush);
    wasPushed = true;
  }
  if (!playerCollisionCapsuleOverlaps(levelWorld, rig, feetPosition)) {
    return 'pushed';
  }
  return allowLift && playerCollisionLiftOutOfGeometry(levelWorld, rig, feetPosition) ? 'lifted' : 'stuck';
}

/**
 * Returns whether the capsule at a feet position overlaps level geometry deeper
 * than the tolerance.
 *
 * @param levelWorld Level world.
 * @param rig Character rig.
 * @param feetPosition Feet position.
 * @returns True when overlapping.
 */
export function playerCollisionCapsuleOverlaps(
  levelWorld: PhysicsLevelWorld,
  rig: PlayerCollisionCharacterRig,
  feetPosition: THREE.Vector3,
): boolean {
  return playerCollisionFindDeepestContact(levelWorld, rig, feetPosition);
}

/**
 * Returns whether the capsule center sits inside closed level geometry.
 *
 * @param levelWorld Level world.
 * @param feetPosition Feet position.
 * @returns True when the center is inside a solid.
 */
export function playerCollisionCapsuleCenterBuried(
  levelWorld: PhysicsLevelWorld,
  feetPosition: THREE.Vector3,
): boolean {
  playerCollisionWriteCenter(feetPosition);
  const projection = levelWorld
    .getRapierWorld()
    .projectPoint(scratchCenter, true, undefined, PHYSICS_LEVEL_GROUPS_LEVEL_QUERY);
  return projection !== null && projection.isInside;
}

/**
 * Finds the deepest contact between the capsule and level colliders.
 *
 * @param levelWorld Level world.
 * @param rig Character rig.
 * @param feetPosition Feet position.
 * @returns True when a contact deeper than the tolerance exists.
 */
function playerCollisionFindDeepestContact(
  levelWorld: PhysicsLevelWorld,
  rig: PlayerCollisionCharacterRig,
  feetPosition: THREE.Vector3,
): boolean {
  deepestContact.depth = PLAYER_DEPENETRATION_TOLERANCE_METERS;
  let found = false;
  playerCollisionWriteCenter(feetPosition);
  const shape = rig.getCapsuleShape();
  levelWorld.getRapierWorld().intersectionsWithShape(
    scratchCenter,
    IDENTITY_ROTATION,
    shape,
    (collider) => {
      found = playerCollisionMeasureContact(collider, shape) || found;
      return true;
    },
    undefined,
    PHYSICS_LEVEL_GROUPS_LEVEL_QUERY,
  );
  return found;
}

/**
 * Measures one collider contact and keeps it when it is the deepest so far.
 *
 * @param collider Overlapping level collider.
 * @param shape Capsule shape at scratchCenter.
 * @returns True when this contact became the deepest.
 */
function playerCollisionMeasureContact(collider: RAPIER.Collider, shape: RAPIER.Shape): boolean {
  const contact = collider.contactShape(shape, scratchCenter, IDENTITY_ROTATION, 0);
  if (!contact || -contact.distance <= deepestContact.depth) {
    return false;
  }
  deepestContact.depth = -contact.distance;
  deepestContact.normal.set(contact.normal1.x, contact.normal1.y, contact.normal1.z);
  if (deepestContact.normal.lengthSq() < 1e-12) {
    deepestContact.normal.set(0, 1, 0);
  }
  deepestContact.normal.normalize();
  return true;
}

/**
 * Tries lifted poses above the feet until one is free and not buried, then
 * keeps the lowest such pose.
 *
 * @param levelWorld Level world.
 * @param rig Character rig.
 * @param feetPosition Feet position (mutated on success).
 * @returns True when a free pose was found.
 */
function playerCollisionLiftOutOfGeometry(
  levelWorld: PhysicsLevelWorld,
  rig: PlayerCollisionCharacterRig,
  feetPosition: THREE.Vector3,
): boolean {
  const stepCount = Math.ceil(PLAYER_ESCAPE_SEARCH_MAX_LIFT_METERS / PLAYER_ESCAPE_SEARCH_STEP_METERS);
  for (let step = 1; step <= stepCount; step++) {
    scratchProbeFeet.copy(feetPosition);
    scratchProbeFeet.y += step * PLAYER_ESCAPE_SEARCH_STEP_METERS;
    if (playerCollisionPoseIsFree(levelWorld, rig, scratchProbeFeet)) {
      feetPosition.copy(scratchProbeFeet);
      return true;
    }
  }
  return false;
}

/**
 * Returns whether a pose neither overlaps geometry nor sits inside a solid.
 *
 * @param levelWorld Level world.
 * @param rig Character rig.
 * @param feetPosition Candidate feet position.
 * @returns True when free.
 */
export function playerCollisionPoseIsFree(
  levelWorld: PhysicsLevelWorld,
  rig: PlayerCollisionCharacterRig,
  feetPosition: THREE.Vector3,
): boolean {
  if (playerCollisionFindDeepestContact(levelWorld, rig, feetPosition)) {
    return false;
  }
  return !playerCollisionCapsuleCenterBuried(levelWorld, feetPosition);
}

/**
 * Writes the capsule center for a feet position into the scratch center.
 *
 * @param feetPosition Feet position.
 */
function playerCollisionWriteCenter(feetPosition: THREE.Vector3): void {
  scratchCenter.x = feetPosition.x;
  scratchCenter.y = feetPosition.y + PLAYER_CAPSULE_CENTER_ABOVE_FEET_METERS;
  scratchCenter.z = feetPosition.z;
}
