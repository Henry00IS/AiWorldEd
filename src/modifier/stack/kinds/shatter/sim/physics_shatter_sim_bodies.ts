import type RAPIER from '@dimforge/rapier3d-deterministic-compat';
import type * as THREE from 'three';
import type { PhysicsRapierModule } from '@/physics/rapier/physics_rapier_runtime.js';

/**
 * Gap kept between neighbouring pieces so touching cut faces start apart, in
 * metres.
 */
const PHYSICS_SHATTER_BODY_INSET = 0.001;

/** Smallest share of its size a piece keeps when inset. */
const PHYSICS_SHATTER_BODY_INSET_MIN_SCALE = 0.9;

/** Surface friction of pieces and fixed geometry. */
const PHYSICS_SHATTER_BODY_FRICTION = 0.7;

/** Bounciness of pieces and fixed geometry. */
const PHYSICS_SHATTER_BODY_RESTITUTION = 0.1;

/** Half extent of the endless floor slab, in metres. */
const PHYSICS_SHATTER_FLOOR_HALF_EXTENT = 1000;

/**
 * Returns hull points relative to a centre and pulled towards it by a
 * millimetre, so pieces that share a cut face do not start in contact.
 *
 * @param worldPoints Flat world-space hull points.
 * @param centre World centre the body sits at.
 * @returns Flat points relative to the centre.
 */
export function physicsShatterBodyLocalHull(worldPoints: Float32Array, centre: THREE.Vector3): Float32Array {
  const local = new Float32Array(worldPoints.length);
  for (let offset = 0; offset + 2 < worldPoints.length; offset += 3) {
    const x = (worldPoints[offset] ?? 0) - centre.x;
    const y = (worldPoints[offset + 1] ?? 0) - centre.y;
    const z = (worldPoints[offset + 2] ?? 0) - centre.z;
    const length = Math.hypot(x, y, z);
    const scale =
      length > 0 ? Math.max(PHYSICS_SHATTER_BODY_INSET_MIN_SCALE, 1 - PHYSICS_SHATTER_BODY_INSET / length) : 1;
    local[offset] = x * scale;
    local[offset + 1] = y * scale;
    local[offset + 2] = z * scale;
  }
  return local;
}

/**
 * Creates the convex collider description of a hull with the shared surface
 * settings and unit density, so mass follows the hull volume.
 *
 * @param rapier Rapier module.
 * @param points Flat hull points in the body's space.
 * @returns Collider description, or null when the hull is flat or degenerate.
 */
export function physicsShatterBodyColliderDesc(
  rapier: PhysicsRapierModule,
  points: Float32Array,
): RAPIER.ColliderDesc | null {
  const desc = points.length >= 12 ? rapier.ColliderDesc.convexHull(points) : null;
  return desc
    ? desc.setDensity(1).setFriction(PHYSICS_SHATTER_BODY_FRICTION).setRestitution(PHYSICS_SHATTER_BODY_RESTITUTION)
    : null;
}

/**
 * Adds a fixed convex hull to the world.
 *
 * @param rapier Rapier module.
 * @param world Simulation world.
 * @param worldPoints Flat world-space hull points.
 * @returns True when the hull was usable.
 */
export function physicsShatterBodyAddStaticHull(
  rapier: PhysicsRapierModule,
  world: RAPIER.World,
  worldPoints: Float32Array,
): boolean {
  const desc = physicsShatterBodyColliderDesc(rapier, worldPoints);
  if (desc) world.createCollider(desc);
  return desc !== null;
}

/**
 * Adds an endless floor whose top sits at a world height.
 *
 * @param rapier Rapier module.
 * @param world Simulation world.
 * @param height World height of the floor top.
 */
export function physicsShatterBodyAddFloor(rapier: PhysicsRapierModule, world: RAPIER.World, height: number): void {
  const extent = PHYSICS_SHATTER_FLOOR_HALF_EXTENT;
  const desc = rapier.ColliderDesc.cuboid(extent, 1, extent)
    .setTranslation(0, height - 1, 0)
    .setFriction(PHYSICS_SHATTER_BODY_FRICTION)
    .setRestitution(PHYSICS_SHATTER_BODY_RESTITUTION);
  world.createCollider(desc);
}
