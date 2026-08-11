import * as THREE from 'three';
import {
  PLAYER_COLLIDER_RADIUS_METERS,
  PLAYER_COLLISION_CAST_SEARCH_ITERATIONS,
  PLAYER_COLLISION_SURFACE_OFFSET_METERS,
  PLAYER_COLLISION_SWEEP_BACKSTEP_METERS,
} from '@/player/player_constants.js';
import {
  createPlayerCapsuleContactScratch,
  playerCapsuleQueryContacts,
  type PlayerCapsuleContactScratch,
} from './player_capsule_contact_query.js';
import type { PlayerCollisionContact } from './player_collision_contact.js';
import type { PlayerTriangleSoup } from './player_triangle_soup.js';

/** One continuous capsule cast hit against the triangle soup. */
export interface PlayerCapsuleCastHit {
  distance: number;
  point: THREE.Vector3;
  normal: THREE.Vector3;
  isWalkable: boolean;
  depth: number;
}

/** Scratch for capsule casts and overlap solves. */
export interface PlayerCapsuleCastScratch {
  contactQuery: PlayerCapsuleContactScratch;
  sampleFeet: THREE.Vector3;
  hitPoint: THREE.Vector3;
  hitNormal: THREE.Vector3;
  direction: THREE.Vector3;
  castOrigin: THREE.Vector3;
}

/**
 * Creates scratch storage for capsule casts.
 *
 * @returns Cast scratch bag.
 */
export function createPlayerCapsuleCastScratch(): PlayerCapsuleCastScratch {
  return {
    contactQuery: createPlayerCapsuleContactScratch(),
    sampleFeet: new THREE.Vector3(),
    hitPoint: new THREE.Vector3(),
    hitNormal: new THREE.Vector3(),
    direction: new THREE.Vector3(),
    castOrigin: new THREE.Vector3(),
  };
}

/**
 * Returns the deepest capsule penetration at a feet pose.
 *
 * @param soup Triangle soup.
 * @param feetPosition Feet pose.
 * @param scratch Cast scratch.
 * @param inflateMeters Extra radius inflate.
 * @returns Deepest contact, or null when free.
 */
export function playerCapsuleDeepestContact(
  soup: PlayerTriangleSoup,
  feetPosition: THREE.Vector3,
  scratch: PlayerCapsuleCastScratch,
  inflateMeters: number = 0,
): PlayerCollisionContact | null {
  const contacts = playerCapsuleQueryContacts(soup, feetPosition, scratch.contactQuery, inflateMeters);
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
 * Returns whether the capsule overlaps geometry at the feet pose.
 *
 * @param soup Triangle soup.
 * @param feetPosition Feet pose.
 * @param scratch Cast scratch.
 * @param inflateMeters Extra radius inflate.
 * @returns True when any positive-depth contact exists.
 */
export function playerCapsuleOverlaps(
  soup: PlayerTriangleSoup,
  feetPosition: THREE.Vector3,
  scratch: PlayerCapsuleCastScratch,
  inflateMeters: number = 0,
): boolean {
  const deepest = playerCapsuleDeepestContact(soup, feetPosition, scratch, inflateMeters);
  return deepest !== null && deepest.depth > 1e-6;
}

/**
 * Depenetrates the capsule using iterative deepest-contact pushes.
 *
 * @param soup Triangle soup.
 * @param feetPosition Feet pose mutated in place.
 * @param scratch Cast scratch.
 * @param maxIterations Maximum depenetration iterations.
 * @returns True when free of deep overlaps after the loop.
 */
export function playerCapsuleDepenetrate(
  soup: PlayerTriangleSoup,
  feetPosition: THREE.Vector3,
  scratch: PlayerCapsuleCastScratch,
  maxIterations: number,
): boolean {
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const deepest = playerCapsuleDeepestContact(soup, feetPosition, scratch, 0);
    if (!deepest || deepest.depth <= PLAYER_COLLISION_SURFACE_OFFSET_METERS * 0.25) {
      return true;
    }
    feetPosition.addScaledVector(deepest.normal, deepest.depth + PLAYER_COLLISION_SURFACE_OFFSET_METERS);
  }
  return !playerCapsuleOverlaps(soup, feetPosition, scratch, 0);
}

/**
 * Sweeps the capsule along a direction and returns the first hit.
 *
 * Starts slightly backstepped, samples the path so thin walls are not tunneled,
 * then binary-searches the first blocked interval for a precise time of
 * impact.
 *
 * @param soup Triangle soup.
 * @param feetPosition Start feet pose.
 * @param direction Unit sweep direction.
 * @param maxDistance Sweep length in meters.
 * @param scratch Cast scratch.
 * @param outHit Destination hit when found.
 * @returns True when a hit is found within maxDistance.
 */
export function playerCapsuleCast(
  soup: PlayerTriangleSoup,
  feetPosition: THREE.Vector3,
  direction: THREE.Vector3,
  maxDistance: number,
  scratch: PlayerCapsuleCastScratch,
  outHit: PlayerCapsuleCastHit,
): boolean {
  if (maxDistance <= 1e-8 || direction.lengthSq() < 1e-12) {
    return false;
  }
  scratch.direction.copy(direction).normalize();
  const backstep = PLAYER_COLLISION_SWEEP_BACKSTEP_METERS;
  scratch.castOrigin.copy(feetPosition).addScaledVector(scratch.direction, -backstep);
  if (playerCapsuleOverlaps(soup, scratch.castOrigin, scratch, 0)) {
    return playerCapsuleCastWriteContactHit(soup, feetPosition, 0, scratch, outHit);
  }
  const castLength = maxDistance + backstep;
  const blockedFromOrigin = playerCapsuleCastFindFirstBlocked(
    soup,
    scratch.castOrigin,
    scratch.direction,
    castLength,
    scratch,
  );
  if (blockedFromOrigin === null) {
    return false;
  }
  const refinedFromOrigin = playerCapsuleCastRefineToi(
    soup,
    scratch.castOrigin,
    scratch.direction,
    blockedFromOrigin,
    scratch,
  );
  const hitDistance = Math.max(0, refinedFromOrigin - backstep);
  if (hitDistance > maxDistance + 1e-6) {
    return false;
  }
  return playerCapsuleCastWriteContactHit(soup, feetPosition, hitDistance, scratch, outHit);
}

/**
 * Finds the first coarse sample along the cast that overlaps geometry.
 *
 * @param soup Triangle soup.
 * @param origin Cast origin feet.
 * @param direction Unit direction.
 * @param castLength Cast length from origin.
 * @param scratch Cast scratch.
 * @returns Distance of first blocked sample from origin, or null when free.
 */
function playerCapsuleCastFindFirstBlocked(
  soup: PlayerTriangleSoup,
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  castLength: number,
  scratch: PlayerCapsuleCastScratch,
): number | null {
  const step = Math.max(0.04, PLAYER_COLLIDER_RADIUS_METERS * 0.3);
  const sampleCount = Math.max(8, Math.ceil(castLength / step));
  for (let sample = 1; sample <= sampleCount; sample++) {
    const distance = (castLength * sample) / sampleCount;
    scratch.sampleFeet.copy(origin).addScaledVector(direction, distance);
    if (playerCapsuleOverlaps(soup, scratch.sampleFeet, scratch, 0)) {
      return distance;
    }
  }
  return null;
}

/**
 * Binary-searches the first blocked distance for a precise time of impact.
 *
 * @param soup Triangle soup.
 * @param origin Cast origin feet.
 * @param direction Unit direction.
 * @param blockedDistance Coarse blocked distance from origin.
 * @param scratch Cast scratch.
 * @returns Refined hit distance from origin.
 */
function playerCapsuleCastRefineToi(
  soup: PlayerTriangleSoup,
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  blockedDistance: number,
  scratch: PlayerCapsuleCastScratch,
): number {
  let lo = 0;
  let hi = blockedDistance;
  for (let iteration = 0; iteration < PLAYER_COLLISION_CAST_SEARCH_ITERATIONS; iteration++) {
    const mid = (lo + hi) * 0.5;
    scratch.sampleFeet.copy(origin).addScaledVector(direction, mid);
    if (playerCapsuleOverlaps(soup, scratch.sampleFeet, scratch, 0)) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return hi;
}

/**
 * Writes a cast hit from the deepest contact at the impact feet pose.
 *
 * @param soup Triangle soup.
 * @param feetPosition Start feet pose.
 * @param hitDistance Impact distance along the cast from feetPosition.
 * @param scratch Cast scratch.
 * @param outHit Destination hit.
 * @returns True when a contact exists at the impact pose.
 */
function playerCapsuleCastWriteContactHit(
  soup: PlayerTriangleSoup,
  feetPosition: THREE.Vector3,
  hitDistance: number,
  scratch: PlayerCapsuleCastScratch,
  outHit: PlayerCapsuleCastHit,
): boolean {
  scratch.sampleFeet.copy(feetPosition).addScaledVector(scratch.direction, hitDistance);
  let deepest = playerCapsuleDeepestContact(soup, scratch.sampleFeet, scratch, 0);
  if (!deepest) {
    scratch.sampleFeet.addScaledVector(scratch.direction, PLAYER_COLLISION_SURFACE_OFFSET_METERS);
    deepest = playerCapsuleDeepestContact(soup, scratch.sampleFeet, scratch, 0);
  }
  if (!deepest) {
    return false;
  }
  outHit.distance = hitDistance;
  outHit.point.copy(deepest.point);
  outHit.normal.copy(deepest.normal);
  outHit.isWalkable = deepest.isWalkable;
  outHit.depth = deepest.depth;
  return true;
}

/**
 * Creates an empty cast hit structure.
 *
 * @returns Empty hit.
 */
export function createPlayerCapsuleCastHit(): PlayerCapsuleCastHit {
  return {
    distance: 0,
    point: new THREE.Vector3(),
    normal: new THREE.Vector3(0, 1, 0),
    isWalkable: false,
    depth: 0,
  };
}
