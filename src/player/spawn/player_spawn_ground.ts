import * as THREE from 'three';
import type { PhysicsLevelWorld } from '@/physics/level/physics_level_world.js';
import { playerCollisionPoseIsFree } from '@/player/collision/player_collision_depenetration.js';
import { playerCollisionSettlePose } from '@/player/collision/player_collision_resolve.js';
import type { PlayerCollisionRayHit, PlayerCollisionWorld } from '@/player/collision/player_collision_world.js';
import { PLAYER_EYE_HEIGHT_METERS } from '@/player/player_constants.js';

/** How far below the camera the ground cast may travel. */
const SPAWN_PROBE_MAX_DROP_METERS = 256;

/** Minimum surface normal Y accepted as walkable spawn ground. */
const SPAWN_WALKABLE_NORMAL_Y = 0.45;

/** Offset along the hit normal used to test the stand-on side of a surface. */
const SPAWN_SUPPORT_SIDE_METERS = 0.05;

/** How far a buried spawn may search for nearby open space. */
const SPAWN_OPEN_SEARCH_MAX_METERS = 8;

/** Step size used while walking from a buried sample toward open space. */
const SPAWN_OPEN_SEARCH_STEP_METERS = 0.25;

const WORLD_DOWN = new THREE.Vector3(0, -1, 0);
const DIAGONAL = Math.SQRT1_2;

/** Axis and diagonal directions used after look and origin probes fail. */
const SPAWN_SEARCH_DIRECTIONS: readonly THREE.Vector3[] = [
  new THREE.Vector3(0, -1, 0),
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

const scratchSupportSide = new THREE.Vector3();
const scratchLookDirection = new THREE.Vector3();
const scratchTowardOrigin = new THREE.Vector3();
const scratchSearchOrigin = new THREE.Vector3();
const scratchProbe = new THREE.Vector3();

/** Status shown when Play Mode cannot start because the spawn sits in a solid. */
export const PLAYER_SPAWN_INSIDE_SOLID_STATUS =
  "Can't start Play Mode inside a solid — move the camera into open space or place a figurine spawn";

/**
 * Resolves a safe feet position under the camera for play-mode spawn.
 *
 * Starts from camera height minus eye height so mid-air stays mid-air. Only
 * lifts onto ground when that pose would put the feet below walkable support.
 * When that pose is buried in a solid (for example just outside an inverted
 * room), searches nearby for open space and returns false when none is found.
 *
 * @param camera Perspective camera used when no figurine spawn is set.
 * @param collisionWorld Collision world with current level soup.
 * @param outFeet Destination feet position.
 * @returns True when the resolved pose is in open space.
 */
export function playerSpawnResolveFeetUnderCamera(
  camera: THREE.PerspectiveCamera,
  collisionWorld: PlayerCollisionWorld,
  outFeet: THREE.Vector3,
): boolean {
  camera.getWorldDirection(scratchLookDirection);
  return playerSpawnEnsureOpenFeet(camera.position, collisionWorld, outFeet, scratchLookDirection);
}

/**
 * Settles a sample into a feet pose and, when that pose is buried, searches
 * nearby for open space along the look direction, toward the origin, and along
 * the world axes.
 *
 * @param samplePosition Camera or figurine sample used as the search origin.
 * @param collisionWorld Collision world with current level soup.
 * @param outFeet Destination feet position.
 * @param lookDirection Optional unit look direction to search along first.
 * @returns True when the resolved pose is in open space.
 */
export function playerSpawnEnsureOpenFeet(
  samplePosition: THREE.Vector3,
  collisionWorld: PlayerCollisionWorld,
  outFeet: THREE.Vector3,
  lookDirection?: THREE.Vector3,
): boolean {
  playerSpawnWriteFeetFromSample(samplePosition, collisionWorld, outFeet);
  if (playerSpawnPoseIsOpen(collisionWorld, outFeet)) {
    return true;
  }
  return playerSpawnSearchOpenPose(samplePosition, collisionWorld, outFeet, lookDirection);
}

/**
 * Settles an already-resolved feet pose (for example a figurine spawn) and
 * searches nearby when that pose is buried in a solid.
 *
 * @param feetPosition Starting feet position.
 * @param collisionWorld Collision world with current level soup.
 * @param outFeet Destination feet position.
 * @returns True when the resolved pose is in open space.
 */
export function playerSpawnEnsureOpenStandingFeet(
  feetPosition: THREE.Vector3,
  collisionWorld: PlayerCollisionWorld,
  outFeet: THREE.Vector3,
): boolean {
  outFeet.copy(feetPosition);
  playerCollisionSettlePose(collisionWorld, outFeet);
  if (playerSpawnPoseIsOpen(collisionWorld, outFeet)) {
    return true;
  }
  scratchSearchOrigin.copy(feetPosition);
  scratchSearchOrigin.y += PLAYER_EYE_HEIGHT_METERS;
  return playerSpawnSearchOpenPose(scratchSearchOrigin, collisionWorld, outFeet);
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
 * Writes a settled feet pose under a sample, lifting onto walkable support when
 * the eye-height pose would sit below it.
 *
 * @param samplePosition Camera or probe origin.
 * @param collisionWorld Collision world.
 * @param outFeet Destination feet position.
 */
function playerSpawnWriteFeetFromSample(
  samplePosition: THREE.Vector3,
  collisionWorld: PlayerCollisionWorld,
  outFeet: THREE.Vector3,
): void {
  outFeet.set(samplePosition.x, samplePosition.y - PLAYER_EYE_HEIGHT_METERS, samplePosition.z);
  const supportY = playerSpawnRaycastSupportY(samplePosition, collisionWorld);
  if (supportY !== null && outFeet.y < supportY) {
    outFeet.y = supportY;
  }
  playerCollisionSettlePose(collisionWorld, outFeet);
}

/**
 * Returns whether a feet pose is free of solid and overlap, or when no
 * collision soup is available yet.
 *
 * @param collisionWorld Collision world.
 * @param feetPosition Candidate feet position.
 * @returns True when the pose is safe to spawn.
 */
function playerSpawnPoseIsOpen(collisionWorld: PlayerCollisionWorld, feetPosition: THREE.Vector3): boolean {
  const levelWorld = collisionWorld.syncLevelWorld();
  const rig = collisionWorld.getCharacterRig();
  if (!levelWorld || !rig) {
    return true;
  }
  return playerCollisionPoseIsFree(levelWorld, rig, feetPosition);
}

/**
 * Walks out from a buried sample looking for the first open feet pose.
 *
 * @param samplePosition Search origin.
 * @param collisionWorld Collision world.
 * @param outFeet Destination feet position, mutated on success.
 * @param lookDirection Optional look direction to search first.
 * @returns True when an open pose was found.
 */
function playerSpawnSearchOpenPose(
  samplePosition: THREE.Vector3,
  collisionWorld: PlayerCollisionWorld,
  outFeet: THREE.Vector3,
  lookDirection?: THREE.Vector3,
): boolean {
  const stepCount = Math.ceil(SPAWN_OPEN_SEARCH_MAX_METERS / SPAWN_OPEN_SEARCH_STEP_METERS);
  if (lookDirection && lookDirection.lengthSq() > 1e-12) {
    scratchLookDirection.copy(lookDirection).normalize();
    if (playerSpawnSearchAlong(samplePosition, scratchLookDirection, stepCount, collisionWorld, outFeet)) {
      return true;
    }
    scratchLookDirection.negate();
    if (playerSpawnSearchAlong(samplePosition, scratchLookDirection, stepCount, collisionWorld, outFeet)) {
      return true;
    }
  }
  if (samplePosition.lengthSq() > 1e-12) {
    scratchTowardOrigin.copy(samplePosition).negate().normalize();
    if (playerSpawnSearchAlong(samplePosition, scratchTowardOrigin, stepCount, collisionWorld, outFeet)) {
      return true;
    }
  }
  for (const direction of SPAWN_SEARCH_DIRECTIONS) {
    if (playerSpawnSearchAlong(samplePosition, direction, stepCount, collisionWorld, outFeet)) {
      return true;
    }
  }
  return false;
}

/**
 * Walks one direction from the sample and stops at the first open feet pose.
 *
 * @param samplePosition Search origin.
 * @param direction Unit direction to walk.
 * @param stepCount Number of steps to try.
 * @param collisionWorld Collision world.
 * @param outFeet Destination feet position, mutated on success.
 * @returns True when an open pose was found along this direction.
 */
function playerSpawnSearchAlong(
  samplePosition: THREE.Vector3,
  direction: THREE.Vector3,
  stepCount: number,
  collisionWorld: PlayerCollisionWorld,
  outFeet: THREE.Vector3,
): boolean {
  for (let step = 1; step <= stepCount; step++) {
    scratchProbe.copy(samplePosition).addScaledVector(direction, step * SPAWN_OPEN_SEARCH_STEP_METERS);
    playerSpawnWriteFeetFromSample(scratchProbe, collisionWorld, outFeet);
    if (playerSpawnPoseIsOpen(collisionWorld, outFeet)) {
      return true;
    }
  }
  return false;
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
