import * as THREE from 'three';
import {
  PLAYER_COLLIDER_HEIGHT_METERS,
  PLAYER_CONTACT_SKIN_METERS,
  PLAYER_CONTACT_SOLVER_ITERATIONS,
  PLAYER_GROUND_PROBE_EXTRA_METERS,
} from '@/player/player_constants.js';
import {
  createPlayerCapsuleContactScratch,
  playerCapsuleQueryContacts,
  type PlayerCapsuleContactScratch,
} from './player_capsule_contact_query.js';
import type { PlayerCollisionContact } from './player_collision_contact.js';
import type { PlayerTriangleSoup } from './player_triangle_soup.js';
import type { PlayerCollisionWorld } from './player_collision_world.js';

/** Result of resolving contacts at a feet pose. */
export interface PlayerCollisionSolveResult {
  isGrounded: boolean;
  wallNormal: THREE.Vector3;
  hasWallContact: boolean;
  deepestWallDepth: number;
}

/** Scratch storage for the contact solver. */
export interface PlayerCollisionSolverScratch {
  contactQuery: PlayerCapsuleContactScratch;
  wallNormal: THREE.Vector3;
  groundNormal: THREE.Vector3;
  push: THREE.Vector3;
  sample: THREE.Vector3;
}

/**
 * Creates scratch storage for contact solving.
 *
 * @returns Solver scratch bag.
 */
export function createPlayerCollisionSolverScratch(): PlayerCollisionSolverScratch {
  return {
    contactQuery: createPlayerCapsuleContactScratch(),
    wallNormal: new THREE.Vector3(),
    groundNormal: new THREE.Vector3(0, 1, 0),
    push: new THREE.Vector3(),
    sample: new THREE.Vector3(),
  };
}

/**
 * Iteratively depenetrates the capsule using the deepest contact each pass.
 *
 * @param soup Static triangle soup.
 * @param feetPosition Feet position mutated in place.
 * @param scratch Solver scratch.
 * @returns Grounded flag and strongest wall normal.
 */
export function playerCollisionSolvePose(
  soup: PlayerTriangleSoup,
  feetPosition: THREE.Vector3,
  scratch: PlayerCollisionSolverScratch,
): PlayerCollisionSolveResult {
  scratch.wallNormal.set(0, 0, 0);
  let hasWallContact = false;
  let deepestWallDepth = 0;
  let isGrounded = false;
  for (let iteration = 0; iteration < PLAYER_CONTACT_SOLVER_ITERATIONS; iteration++) {
    const contacts = playerCapsuleQueryContacts(soup, feetPosition, scratch.contactQuery);
    if (contacts.length === 0) {
      break;
    }
    const deepest = playerCollisionFindDeepestContact(contacts);
    if (!deepest || deepest.depth < 1e-5) {
      isGrounded = isGrounded || playerCollisionContactsHaveWalkable(contacts);
      break;
    }
    const didPush = playerCollisionApplyOneContact(feetPosition, deepest, scratch);
    if (deepest.isWalkable) {
      isGrounded = true;
      if (!didPush) {
        break;
      }
      continue;
    }
    if (deepest.depth > deepestWallDepth) {
      deepestWallDepth = deepest.depth;
      scratch.wallNormal.copy(deepest.normal);
      hasWallContact = true;
    }
    if (!didPush) {
      break;
    }
  }
  if (!isGrounded) {
    const contacts = playerCapsuleQueryContacts(soup, feetPosition, scratch.contactQuery);
    isGrounded = playerCollisionContactsHaveWalkable(contacts);
  }
  if (!isGrounded) {
    isGrounded = playerCollisionProbeSupport(soup, feetPosition, scratch);
  }
  return {
    isGrounded,
    wallNormal: scratch.wallNormal,
    hasWallContact,
    deepestWallDepth,
  };
}

/**
 * Applies one contact: Y-only for walkable floors, full normal for walls.
 *
 * Walkable contacts rest inside the contact skin so ground stick does not fight
 * depenetration and bob the capsule every frame.
 *
 * @param feetPosition Feet position mutated in place.
 * @param contact Contact to resolve.
 * @param scratch Solver scratch for ground normal storage.
 * @returns True when the feet were moved.
 */
function playerCollisionApplyOneContact(
  feetPosition: THREE.Vector3,
  contact: PlayerCollisionContact,
  scratch: PlayerCollisionSolverScratch,
): boolean {
  if (contact.isWalkable && contact.normal.y > 0.05) {
    scratch.groundNormal.copy(contact.normal);
    const excessDepth = contact.depth - PLAYER_CONTACT_SKIN_METERS;
    if (excessDepth <= 1e-5) {
      return false;
    }
    feetPosition.y += excessDepth / contact.normal.y;
    return true;
  }
  feetPosition.addScaledVector(contact.normal, contact.depth);
  return contact.depth > 1e-5;
}

/**
 * Returns the contact with the largest penetration depth.
 *
 * @param contacts Contact list.
 * @returns Deepest contact, or null when empty.
 */
function playerCollisionFindDeepestContact(contacts: readonly PlayerCollisionContact[]): PlayerCollisionContact | null {
  let deepest: PlayerCollisionContact | null = null;
  for (let index = 0; index < contacts.length; index++) {
    const contact = contacts[index];
    if (!contact) {
      continue;
    }
    if (!deepest || contact.depth > deepest.depth) {
      deepest = contact;
    }
  }
  return deepest;
}

/**
 * Returns true when a walkable support exists within the stick band under feet.
 *
 * @param soup Triangle soup.
 * @param feetPosition Current feet position.
 * @param scratch Solver scratch.
 * @returns True when support is found without moving the feet.
 */
export function playerCollisionProbeSupport(
  soup: PlayerTriangleSoup,
  feetPosition: THREE.Vector3,
  scratch: PlayerCollisionSolverScratch,
): boolean {
  const savedY = feetPosition.y;
  feetPosition.y -= PLAYER_GROUND_PROBE_EXTRA_METERS;
  const contacts = playerCapsuleQueryContacts(soup, feetPosition, scratch.contactQuery);
  feetPosition.y = savedY;
  return playerCollisionContactsHaveWalkable(contacts);
}

/**
 * Snaps the feet onto walkable support found by a downward raycast.
 *
 * @param world Collision world for raycasts.
 * @param soup Triangle soup for final pose resolve.
 * @param feetPosition Feet position mutated when support is found.
 * @param maxDropMeters Maximum downward snap distance.
 * @param scratch Solver scratch.
 * @returns True when snapped onto support.
 */
export function playerCollisionSnapToSupport(
  world: PlayerCollisionWorld,
  soup: PlayerTriangleSoup,
  feetPosition: THREE.Vector3,
  maxDropMeters: number,
  scratch: PlayerCollisionSolverScratch,
): boolean {
  const supportY = playerCollisionFindSupportY(world, feetPosition, maxDropMeters, scratch);
  if (supportY === null) {
    return false;
  }
  if (supportY > feetPosition.y + 1e-3) {
    return false;
  }
  if (feetPosition.y - supportY > maxDropMeters + 1e-3) {
    return false;
  }
  feetPosition.y = supportY;
  playerCollisionSolvePose(soup, feetPosition, scratch);
  return true;
}

/** Small lift so the ground ray starts above the floor, not inside it. */
const GROUND_PROBE_LIFT_METERS = 0.08;

/**
 * Finds walkable feet Y under the capsule using a downward raycast.
 *
 * Casts from just above the feet, not from a full step height above, so nearby
 * lips and coplanar CSG faces cannot steal the hit and unground the body on
 * flat floors.
 *
 * @param world Collision world.
 * @param feetPosition Reference feet position.
 * @param maxDropMeters Maximum distance below the current feet.
 * @param scratch Solver scratch.
 * @returns Support feet Y, or null when none.
 */
export function playerCollisionFindSupportY(
  world: PlayerCollisionWorld,
  feetPosition: THREE.Vector3,
  maxDropMeters: number,
  scratch: PlayerCollisionSolverScratch,
): number | null {
  scratch.sample.set(feetPosition.x, feetPosition.y + GROUND_PROBE_LIFT_METERS, feetPosition.z);
  const castDistance = maxDropMeters + GROUND_PROBE_LIFT_METERS;
  const hit = world.raycastNearest(scratch.sample, WORLD_DOWN, castDistance);
  if (!hit) {
    return null;
  }
  if (hit.face) {
    scratch.push.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).normalize();
    if (scratch.push.y < 0.45) {
      return null;
    }
  }
  return hit.point.y;
}

/**
 * Returns whether any contact in the list is walkable.
 *
 * @param contacts Contact list.
 * @returns True when a walkable contact exists.
 */
function playerCollisionContactsHaveWalkable(contacts: readonly PlayerCollisionContact[]): boolean {
  for (let index = 0; index < contacts.length; index++) {
    const contact = contacts[index];
    if (contact && contact.isWalkable) {
      return true;
    }
  }
  return false;
}

/**
 * Returns a long-range ground hit Y for spawn snapping helpers.
 *
 * @param world Collision world.
 * @param feetPosition Feet position.
 * @param scratch Solver scratch.
 * @returns Hit feet Y, or null.
 */
export function playerCollisionRaycastGroundY(
  world: PlayerCollisionWorld,
  feetPosition: THREE.Vector3,
  scratch: PlayerCollisionSolverScratch,
): number | null {
  scratch.sample.set(feetPosition.x, feetPosition.y + PLAYER_COLLIDER_HEIGHT_METERS, feetPosition.z);
  const hit = world.raycastNearest(scratch.sample, WORLD_DOWN, PLAYER_COLLIDER_HEIGHT_METERS + 50);
  if (!hit) {
    return null;
  }
  return hit.point.y;
}

const WORLD_DOWN = new THREE.Vector3(0, -1, 0);
