import * as THREE from 'three';
import { PHYSICS_LEVEL_GROUPS_LEVEL_QUERY } from '@/physics/level/physics_level_collision_groups.js';
import { PLAYER_CHARACTER_CONTROLLER_OFFSET_METERS } from '@/player/player_constants.js';
import { PLAYER_CAPSULE_CENTER_ABOVE_FEET_METERS } from './player_collision_character_rig.js';
import type { PlayerCollisionWorld } from './player_collision_world.js';

/** Ground found under the capsule by a downward sweep. */
export interface PlayerCollisionGroundSample {
  /** How far the feet can drop before resting on the ground. */
  distance: number;
  /** World surface normal of the ground. */
  normal: THREE.Vector3;
}

const IDENTITY_ROTATION = { x: 0, y: 0, z: 0, w: 1 };
const DOWN_VELOCITY = { x: 0, y: -1, z: 0 };
const groundSample: PlayerCollisionGroundSample = { distance: 0, normal: new THREE.Vector3() };

/**
 * Sweeps the player capsule straight down to find the ground it would rest on.
 *
 * @param world Collision world.
 * @param feetPosition Feet position.
 * @param maxDrop Longest drop to search.
 * @returns Ground sample (reused object), or null when nothing is below.
 */
export function playerCollisionSampleGround(
  world: PlayerCollisionWorld,
  feetPosition: THREE.Vector3,
  maxDrop: number,
): PlayerCollisionGroundSample | null {
  const rig = world.getCharacterRig();
  const levelWorld = world.syncLevelWorld();
  if (!rig || !levelWorld) {
    return null;
  }
  const hit = levelWorld
    .getRapierWorld()
    .castShape(
      { x: feetPosition.x, y: feetPosition.y + PLAYER_CAPSULE_CENTER_ABOVE_FEET_METERS, z: feetPosition.z },
      IDENTITY_ROTATION,
      DOWN_VELOCITY,
      rig.getCapsuleShape(),
      PLAYER_CHARACTER_CONTROLLER_OFFSET_METERS,
      maxDrop,
      true,
      undefined,
      PHYSICS_LEVEL_GROUPS_LEVEL_QUERY,
    );
  if (!hit) {
    return null;
  }
  groundSample.distance = hit.time_of_impact;
  groundSample.normal.set(-hit.normal2.x, -hit.normal2.y, -hit.normal2.z).normalize();
  return groundSample;
}
