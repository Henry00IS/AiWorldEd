import * as THREE from 'three';
import { PLAYER_COLLIDER_RADIUS_METERS, PLAYER_CONTACT_SKIN_METERS } from '@/player/player_constants.js';
import {
  playerCapsuleAabbExpand,
  playerCapsuleAabbFromFeet,
  playerCapsuleSegmentFromFeet,
} from './player_capsule_geometry.js';
import {
  playerCollisionContactCreate,
  playerCollisionContactWrite,
  type PlayerCollisionContact,
} from './player_collision_contact.js';
import { playerClosestPointsSegmentTriangle } from './player_triangle_math.js';
import type { PlayerTriangleSoup } from './player_triangle_soup.js';

/** Scratch and output state for capsule contact queries. */
export interface PlayerCapsuleContactScratch {
  segmentBottom: THREE.Vector3;
  segmentTop: THREE.Vector3;
  vertexA: THREE.Vector3;
  vertexB: THREE.Vector3;
  vertexC: THREE.Vector3;
  pointOnSegment: THREE.Vector3;
  pointOnTriangle: THREE.Vector3;
  contactNormal: THREE.Vector3;
  queryBox: THREE.Box3;
  triangleIndices: number[];
  contacts: PlayerCollisionContact[];
  contactPool: PlayerCollisionContact[];
}

/**
 * Creates scratch storage for capsule contact queries.
 *
 * @returns Scratch bag.
 */
export function createPlayerCapsuleContactScratch(): PlayerCapsuleContactScratch {
  return {
    segmentBottom: new THREE.Vector3(),
    segmentTop: new THREE.Vector3(),
    vertexA: new THREE.Vector3(),
    vertexB: new THREE.Vector3(),
    vertexC: new THREE.Vector3(),
    pointOnSegment: new THREE.Vector3(),
    pointOnTriangle: new THREE.Vector3(),
    contactNormal: new THREE.Vector3(),
    queryBox: new THREE.Box3(),
    triangleIndices: [],
    contacts: [],
    contactPool: [],
  };
}

/**
 * Fills scratch.contacts with capsule-triangle contacts at the feet pose.
 *
 * @param soup Static triangle soup.
 * @param feetPosition World feet position.
 * @param scratch Reusable query scratch.
 * @param inflateMeters Extra radius beyond the capsule radius (default skin).
 * @returns Contact list stored on scratch (do not retain across queries).
 */
export function playerCapsuleQueryContacts(
  soup: PlayerTriangleSoup,
  feetPosition: THREE.Vector3,
  scratch: PlayerCapsuleContactScratch,
  inflateMeters: number = PLAYER_CONTACT_SKIN_METERS,
): PlayerCollisionContact[] {
  scratch.contacts.length = 0;
  scratch.triangleIndices.length = 0;
  playerCapsuleSegmentFromFeet(feetPosition, scratch.segmentBottom, scratch.segmentTop);
  playerCapsuleAabbFromFeet(feetPosition, scratch.queryBox);
  playerCapsuleAabbExpand(scratch.queryBox, Math.max(0, inflateMeters) + 0.05);
  soup.queryAabb(scratch.queryBox, scratch.triangleIndices);
  const radius = PLAYER_COLLIDER_RADIUS_METERS + Math.max(0, inflateMeters);
  for (let index = 0; index < scratch.triangleIndices.length; index++) {
    const triangleIndex = scratch.triangleIndices[index];
    if (triangleIndex === undefined) {
      continue;
    }
    playerCapsuleContactAgainstTriangle(soup, triangleIndex, radius, scratch);
  }
  return scratch.contacts;
}

/**
 * Tests the capsule segment against one soup triangle and records a contact.
 *
 * @param soup Triangle soup.
 * @param triangleIndex Triangle index.
 * @param radius Effective capsule radius including skin.
 * @param scratch Query scratch with segment endpoints already set.
 */
function playerCapsuleContactAgainstTriangle(
  soup: PlayerTriangleSoup,
  triangleIndex: number,
  radius: number,
  scratch: PlayerCapsuleContactScratch,
): void {
  soup.loadTriangleVertices(triangleIndex, scratch.vertexA, scratch.vertexB, scratch.vertexC);
  const distance = playerClosestPointsSegmentTriangle(
    scratch.segmentBottom,
    scratch.segmentTop,
    scratch.vertexA,
    scratch.vertexB,
    scratch.vertexC,
    scratch.pointOnSegment,
    scratch.pointOnTriangle,
  );
  if (distance >= radius) {
    return;
  }
  const depth = radius - distance;
  if (depth <= 1e-8) {
    return;
  }
  playerCapsuleBuildContactNormal(soup, triangleIndex, distance, scratch);
  const contact = playerCapsuleAcquireContact(scratch);
  playerCollisionContactWrite(scratch.pointOnTriangle, scratch.contactNormal, depth, contact);
  scratch.contacts.push(contact);
}

/**
 * Builds an outward contact normal from closest points or the triangle normal.
 *
 * @param soup Triangle soup.
 * @param triangleIndex Triangle index.
 * @param distance Distance between closest points.
 * @param scratch Query scratch holding closest points.
 */
function playerCapsuleBuildContactNormal(
  soup: PlayerTriangleSoup,
  triangleIndex: number,
  distance: number,
  scratch: PlayerCapsuleContactScratch,
): void {
  if (distance > 1e-6) {
    scratch.contactNormal.subVectors(scratch.pointOnSegment, scratch.pointOnTriangle);
    const length = scratch.contactNormal.length();
    if (length > 1e-8) {
      scratch.contactNormal.multiplyScalar(1 / length);
      playerCapsuleOrientNormalOutward(scratch);
      return;
    }
  }
  soup.loadTriangleNormal(triangleIndex, scratch.contactNormal);
  playerCapsuleOrientNormalOutward(scratch);
}

/**
 * Ensures the contact normal points from the triangle toward the capsule.
 *
 * @param scratch Query scratch with segment and normal populated.
 */
function playerCapsuleOrientNormalOutward(scratch: PlayerCapsuleContactScratch): void {
  scratch.pointOnSegment
    .copy(scratch.segmentBottom)
    .add(scratch.segmentTop)
    .multiplyScalar(0.5)
    .sub(scratch.pointOnTriangle);
  if (scratch.contactNormal.dot(scratch.pointOnSegment) < 0) {
    scratch.contactNormal.multiplyScalar(-1);
  }
}

/**
 * Returns a pooled contact instance for the current query.
 *
 * @param scratch Query scratch holding the contact pool.
 * @returns Contact instance owned by the scratch pool.
 */
function playerCapsuleAcquireContact(scratch: PlayerCapsuleContactScratch): PlayerCollisionContact {
  const poolIndex = scratch.contacts.length;
  const existing = scratch.contactPool[poolIndex];
  if (existing) {
    return existing;
  }
  const created = playerCollisionContactCreate();
  scratch.contactPool.push(created);
  return created;
}
