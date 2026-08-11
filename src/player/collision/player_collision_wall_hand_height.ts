import * as THREE from 'three';
import {
  PLAYER_COLLIDER_RADIUS_METERS,
  PLAYER_CONTACT_SKIN_METERS,
  PLAYER_WALL_HAND_MIN_HEIGHT_METERS,
} from '@/player/player_constants.js';
import {
  createPlayerCapsuleContactScratch,
  playerCapsuleQueryContacts,
  type PlayerCapsuleContactScratch,
} from './player_capsule_contact_query.js';
import type { PlayerTriangleSoup } from './player_triangle_soup.js';

/**
 * Extra inflate so near-flush hand probes still register wall contact. A couple
 * of centimeters beyond skin avoids missing palms on valid walls without
 * grabbing distant air.
 */
const HAND_PROBE_INFLATE_METERS = PLAYER_CONTACT_SKIN_METERS + 0.1;

const scratchProbeFeet = new THREE.Vector3();
const sharedContactScratch: PlayerCapsuleContactScratch = createPlayerCapsuleContactScratch();

/**
 * Returns whether solid wall geometry exists around hand height.
 *
 * Places a capsule probe whose lower sphere sits at hand height above the
 * standing feet Y (same collision soup as the body). Wall-like contact there
 * means there is something to plant palms on; open air (short curb) does not.
 *
 * @param soup Triangle soup used by character collision.
 * @param feetPosition Standing feet position (ground sample).
 * @param minHeightMeters Hand height above feet (default 1.4m).
 * @param contactScratch Optional contact scratch (uses a shared bag when
 *   omitted).
 * @returns True when solid exists at hand height.
 */
export function playerCollisionWallSupportsHandPush(
  soup: PlayerTriangleSoup,
  feetPosition: THREE.Vector3,
  minHeightMeters: number = PLAYER_WALL_HAND_MIN_HEIGHT_METERS,
  contactScratch: PlayerCapsuleContactScratch = sharedContactScratch,
): boolean {
  if (minHeightMeters <= 0) {
    return false;
  }
  scratchProbeFeet.set(
    feetPosition.x,
    feetPosition.y + minHeightMeters - PLAYER_COLLIDER_RADIUS_METERS,
    feetPosition.z,
  );
  const contacts = playerCapsuleQueryContacts(soup, scratchProbeFeet, contactScratch, HAND_PROBE_INFLATE_METERS);
  return contactsHaveWallLikeSurface(contacts);
}

/**
 * Returns whether any contact is a non-walkable wall-like surface.
 *
 * @param contacts Contact list from a capsule query.
 * @returns True when a wall-like contact exists.
 */
function contactsHaveWallLikeSurface(contacts: readonly { isWalkable: boolean; normal: THREE.Vector3 }[]): boolean {
  for (let index = 0; index < contacts.length; index++) {
    const contact = contacts[index];
    if (!contact || contact.isWalkable) {
      continue;
    }
    if (Math.hypot(contact.normal.x, contact.normal.z) < 0.55) {
      continue;
    }
    return true;
  }
  return false;
}
