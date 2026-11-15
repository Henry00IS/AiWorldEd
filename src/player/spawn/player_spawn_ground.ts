import * as THREE from 'three';
import type { PhysicsLevelWorld } from '@/physics/level/physics_level_world.js';
import { playerCollisionSettlePose } from '@/player/collision/player_collision_resolve.js';
import type { PlayerCollisionRayHit, PlayerCollisionWorld } from '@/player/collision/player_collision_world.js';
import { PLAYER_EYE_HEIGHT_METERS } from '@/player/player_constants.js';

/** How far below the camera the ground cast may travel. */
const SPAWN_PROBE_MAX_DROP_METERS = 256;

/** Minimum surface normal Y accepted as walkable spawn ground. */
const SPAWN_WALKABLE_NORMAL_Y = 0.45;

/** Offset along the hit normal used to test the stand-on side of a surface. */
const SPAWN_SUPPORT_SIDE_METERS = 0.05;

const WORLD_DOWN = new THREE.Vector3(0, -1, 0);

const scratchSupportSide = new THREE.Vector3();

/**
 * Resolves a safe feet position under the camera for play-mode spawn.
 *
 * Starts from camera height minus eye height so mid-air stays mid-air. Only
 * lifts onto ground when that pose would put the feet below walkable support.
 *
 * @param camera Perspective camera used when no figurine spawn is set.
 * @param collisionWorld Collision world with current level soup.
 * @param outFeet Destination feet position.
 */
export function playerSpawnResolveFeetUnderCamera(
  camera: THREE.PerspectiveCamera,
  collisionWorld: PlayerCollisionWorld,
  outFeet: THREE.Vector3,
): void {
  outFeet.set(camera.position.x, camera.position.y - PLAYER_EYE_HEIGHT_METERS, camera.position.z);
  const supportY = playerSpawnRaycastSupportY(camera.position, collisionWorld);
  if (supportY !== null && outFeet.y < supportY) {
    outFeet.y = supportY;
  }
  playerCollisionSettlePose(collisionWorld, outFeet);
}

/**
 * Finds walkable support Y by casting down from the sample position itself.
 *
 * @param samplePosition Camera or probe origin (cast starts here, not above).
 * @param collisionWorld Collision world.
 * @returns Support Y, or null when no walkable hit is found.
 */
export function playerSpawnRaycastSupportY(
  samplePosition: THREE.Vector3,
  collisionWorld: PlayerCollisionWorld,
): number | null {
  const hit = collisionWorld.raycastNearest(samplePosition, WORLD_DOWN, SPAWN_PROBE_MAX_DROP_METERS);
  const levelWorld = collisionWorld.syncLevelWorld();
  if (!hit || !levelWorld || !playerSpawnHitIsWalkable(hit, levelWorld)) {
    return null;
  }
  return hit.point.y;
}

/**
 * Returns whether a ray hit is a walkable spawn surface.
 *
 * Rejects a hit whose stand-on side is solid, so the exterior of an
 * inverted-world ceiling is not treated as a floor.
 *
 * @param hit Level ray hit.
 * @param levelWorld Level world used for the solid test.
 * @returns True when the surface faces upward and the stand-on side is air.
 */
function playerSpawnHitIsWalkable(hit: PlayerCollisionRayHit, levelWorld: PhysicsLevelWorld): boolean {
  if (hit.normal.y < SPAWN_WALKABLE_NORMAL_Y) {
    return false;
  }
  scratchSupportSide.copy(hit.point).addScaledVector(hit.normal, SPAWN_SUPPORT_SIDE_METERS);
  return !levelWorld.isPointEnclosed(scratchSupportSide);
}
