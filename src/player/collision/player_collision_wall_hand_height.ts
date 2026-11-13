import type * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-deterministic-compat';
import { PHYSICS_LEVEL_GROUPS_LEVEL_QUERY } from '@/physics/level/physics_level_collision_groups.js';
import type { PhysicsRapierModule } from '@/physics/rapier/physics_rapier_runtime.js';
import {
  PLAYER_COLLIDER_RADIUS_METERS,
  PLAYER_CONTACT_SKIN_METERS,
  PLAYER_WALL_HAND_MIN_HEIGHT_METERS,
} from '@/player/player_constants.js';
import type { PlayerCollisionWorld } from './player_collision_world.js';

/** Extra probe radius beyond the capsule so a flush wall is still found. */
const HAND_PROBE_INFLATE_METERS = PLAYER_CONTACT_SKIN_METERS + 0.1;

/** Smallest horizontal normal component a hand-height contact needs. */
const HAND_PROBE_MIN_HORIZONTAL_NORMAL = 0.55;

const IDENTITY_ROTATION = { x: 0, y: 0, z: 0, w: 1 };
const probeCenter = { x: 0, y: 0, z: 0 };
const probeShapes = new WeakMap<object, RAPIER.Ball>();

/**
 * Returns whether a wall-like surface exists at hand height around the body, so
 * palms only plant on walls taller than short barriers.
 *
 * @param world Collision world.
 * @param feetPosition Feet position.
 * @param minHeightMeters Height above the feet the wall must reach.
 * @returns True when a wall-like surface is present at that height.
 */
export function playerCollisionWallSupportsHandPush(
  world: PlayerCollisionWorld,
  feetPosition: THREE.Vector3,
  minHeightMeters: number = PLAYER_WALL_HAND_MIN_HEIGHT_METERS,
): boolean {
  const levelWorld = world.syncLevelWorld();
  if (!levelWorld || minHeightMeters <= 0) {
    return false;
  }
  const shape = resolveProbeShape(levelWorld.getRapier());
  probeCenter.x = feetPosition.x;
  probeCenter.y = feetPosition.y + minHeightMeters;
  probeCenter.z = feetPosition.z;
  let foundWall = false;
  levelWorld.getRapierWorld().intersectionsWithShape(
    probeCenter,
    IDENTITY_ROTATION,
    shape,
    (collider) => {
      foundWall = contactIsWallLike(collider, shape);
      return !foundWall;
    },
    undefined,
    PHYSICS_LEVEL_GROUPS_LEVEL_QUERY,
  );
  return foundWall;
}

/**
 * Returns whether the probe touches a collider on a mostly vertical face.
 *
 * @param collider Level collider overlapping the probe.
 * @param shape Probe ball.
 * @returns True for wall-like contacts.
 */
function contactIsWallLike(collider: RAPIER.Collider, shape: RAPIER.Ball): boolean {
  const contact = collider.contactShape(shape, probeCenter, IDENTITY_ROTATION, 0);
  if (!contact) {
    return false;
  }
  return Math.hypot(contact.normal1.x, contact.normal1.z) >= HAND_PROBE_MIN_HORIZONTAL_NORMAL;
}

/**
 * Returns the cached hand probe ball for a Rapier module.
 *
 * @param rapier Rapier module.
 * @returns Probe ball.
 */
function resolveProbeShape(rapier: PhysicsRapierModule): RAPIER.Ball {
  const cached = probeShapes.get(rapier);
  if (cached) {
    return cached;
  }
  const shape = new rapier.Ball(PLAYER_COLLIDER_RADIUS_METERS + HAND_PROBE_INFLATE_METERS);
  probeShapes.set(rapier, shape);
  return shape;
}
