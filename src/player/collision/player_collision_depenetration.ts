import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-deterministic-compat';
import { PHYSICS_LEVEL_GROUPS_LEVEL_QUERY } from '@/physics/level/physics_level_collision_groups.js';
import type { PhysicsLevelWorld } from '@/physics/level/physics_level_world.js';
import {
  PLAYER_CHARACTER_CONTROLLER_OFFSET_METERS,
  PLAYER_DEPENETRATION_MAX_PASSES,
  PLAYER_ESCAPE_SEARCH_MAX_LIFT_METERS,
  PLAYER_ESCAPE_SEARCH_RADII_METERS,
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
const DIAGONAL = Math.SQRT1_2;
const ESCAPE_DIRECTIONS: readonly THREE.Vector3[] = [
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 0, -1),
  new THREE.Vector3(DIAGONAL, 0, DIAGONAL),
  new THREE.Vector3(-DIAGONAL, 0, DIAGONAL),
  new THREE.Vector3(DIAGONAL, 0, -DIAGONAL),
  new THREE.Vector3(-DIAGONAL, 0, -DIAGONAL),
];

/** Deepest contact found in one overlap pass. */
interface PlayerDeepestContact {
  depth: number;
  normal: THREE.Vector3;
}

const deepestContact: PlayerDeepestContact = { depth: 0, normal: new THREE.Vector3() };

/**
 * Pushes the capsule out of overlapping level geometry along contact normals,
 * then searches nearby poses (sideways and up) when pushing alone does not free
 * it.
 *
 * @param levelWorld Level world.
 * @param rig Character rig with the capsule shape.
 * @param feetPosition Feet position (mutated).
 * @param allowEscape True to also treat a buried center as blocked and search
 *   nearby free poses (used right after an edit touched the body).
 * @returns What happened.
 */
export function playerCollisionDepenetrate(
  levelWorld: PhysicsLevelWorld,
  rig: PlayerCollisionCharacterRig,
  feetPosition: THREE.Vector3,
  allowEscape: boolean,
): PlayerDepenetrationOutcome {
  if (!playerCollisionPoseIsBlocked(levelWorld, rig, feetPosition, allowEscape)) {
    return 'free';
  }
  playerCollisionPushAlongContacts(levelWorld, rig, feetPosition);
  if (!playerCollisionPoseIsBlocked(levelWorld, rig, feetPosition, allowEscape)) {
    return 'pushed';
  }
  return allowEscape && playerCollisionEscapeToFreePose(levelWorld, rig, feetPosition) ? 'lifted' : 'stuck';
}

/**
 * Returns whether a pose overlaps geometry, or optionally sits inside a solid.
 *
 * @param levelWorld Level world.
 * @param rig Character rig.
 * @param feetPosition Feet position.
 * @param includeBuried True to also count a buried capsule center.
 * @returns True when blocked.
 */
function playerCollisionPoseIsBlocked(
  levelWorld: PhysicsLevelWorld,
  rig: PlayerCollisionCharacterRig,
  feetPosition: THREE.Vector3,
  includeBuried: boolean,
): boolean {
  if (playerCollisionCapsuleTouchesGeometry(levelWorld, rig, feetPosition)) {
    return true;
  }
  return includeBuried && playerCollisionCapsuleCenterBuried(levelWorld, feetPosition);
}

/**
 * Pushes the feet along the deepest measurable contact a few times. Deep
 * crossings of a triangle report no usable depth, which the escape search
 * handles instead.
 *
 * @param levelWorld Level world.
 * @param rig Character rig.
 * @param feetPosition Feet position (mutated).
 */
function playerCollisionPushAlongContacts(
  levelWorld: PhysicsLevelWorld,
  rig: PlayerCollisionCharacterRig,
  feetPosition: THREE.Vector3,
): void {
  for (let pass = 0; pass < PLAYER_DEPENETRATION_MAX_PASSES; pass++) {
    if (!playerCollisionFindDeepestContact(levelWorld, rig, feetPosition)) {
      return;
    }
    scratchPush
      .copy(deepestContact.normal)
      .multiplyScalar(deepestContact.depth + PLAYER_CHARACTER_CONTROLLER_OFFSET_METERS);
    feetPosition.add(scratchPush);
  }
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
  return playerCollisionCapsuleTouchesGeometry(levelWorld, rig, feetPosition);
}

/**
 * Returns whether the capsule intersects any level collider surface.
 *
 * @param levelWorld Level world.
 * @param rig Character rig.
 * @param feetPosition Feet position.
 * @returns True when intersecting.
 */
function playerCollisionCapsuleTouchesGeometry(
  levelWorld: PhysicsLevelWorld,
  rig: PlayerCollisionCharacterRig,
  feetPosition: THREE.Vector3,
): boolean {
  playerCollisionWriteCenter(feetPosition);
  const hit = levelWorld
    .getRapierWorld()
    .intersectionWithShape(
      scratchCenter,
      IDENTITY_ROTATION,
      rig.getCapsuleShape(),
      undefined,
      PHYSICS_LEVEL_GROUPS_LEVEL_QUERY,
    );
  return hit !== null && hit !== undefined;
}

/**
 * Returns whether the capsule center sits inside closed level geometry. Every
 * collider is tested, so coplanar faces of neighbours cannot hide it.
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
  let isInside = false;
  levelWorld.getRapierWorld().intersectionsWithPoint(
    scratchCenter,
    () => {
      isInside = true;
      return false;
    },
    undefined,
    PHYSICS_LEVEL_GROUPS_LEVEL_QUERY,
  );
  return isInside;
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
 * Searches growing rings around the feet (up first, then eight sideways
 * directions) and finally straight up, and moves to the first free pose.
 *
 * @param levelWorld Level world.
 * @param rig Character rig.
 * @param feetPosition Feet position (mutated on success).
 * @returns True when a free pose was found.
 */
function playerCollisionEscapeToFreePose(
  levelWorld: PhysicsLevelWorld,
  rig: PlayerCollisionCharacterRig,
  feetPosition: THREE.Vector3,
): boolean {
  for (const radius of PLAYER_ESCAPE_SEARCH_RADII_METERS) {
    for (const direction of ESCAPE_DIRECTIONS) {
      scratchProbeFeet.copy(feetPosition).addScaledVector(direction, radius);
      if (playerCollisionPoseIsFree(levelWorld, rig, scratchProbeFeet)) {
        feetPosition.copy(scratchProbeFeet);
        return true;
      }
    }
  }
  return playerCollisionLiftOutOfGeometry(levelWorld, rig, feetPosition);
}

/**
 * Tries lifted poses above the feet until one is free and not buried.
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
  return !playerCollisionPoseIsBlocked(levelWorld, rig, feetPosition, true);
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
