import * as THREE from 'three';
import { PLAYER_EYE_HEIGHT_METERS } from '@/player/player_constants.js';
import type { PlayerCollisionWorld } from '@/player/collision/player_collision_world.js';
import {
  createPlayerCollisionSolverScratch,
  playerCollisionSolvePose,
} from '@/player/collision/player_collision_solver.js';

/** How far below the camera the ground cast may travel. */
const SPAWN_PROBE_MAX_DROP_METERS = 256;

/** Minimum surface normal Y accepted as walkable spawn ground. */
const SPAWN_WALKABLE_NORMAL_Y = 0.45;

const WORLD_DOWN = new THREE.Vector3(0, -1, 0);
const scratchNormal = new THREE.Vector3();
const spawnSolverScratch = createPlayerCollisionSolverScratch();

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
  playerCollisionSolvePose(collisionWorld.getTriangleSoup(), outFeet, spawnSolverScratch);
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
  if (!hit) {
    return null;
  }
  if (!playerSpawnHitIsWalkable(hit)) {
    return null;
  }
  return hit.point.y;
}

/**
 * Returns whether a ray hit is a walkable spawn surface.
 *
 * @param hit Mesh intersection.
 * @returns True when the surface faces upward enough to stand on.
 */
function playerSpawnHitIsWalkable(hit: THREE.Intersection): boolean {
  if (!hit.face) {
    return true;
  }
  scratchNormal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).normalize();
  return scratchNormal.y >= SPAWN_WALKABLE_NORMAL_Y;
}
