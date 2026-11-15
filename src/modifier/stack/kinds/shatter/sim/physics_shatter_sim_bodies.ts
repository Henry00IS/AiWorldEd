import type RAPIER from '@dimforge/rapier3d-deterministic-compat';
import type * as THREE from 'three';
import type { PhysicsRapierModule } from '@/physics/rapier/physics_rapier_runtime.js';
import type { PhysicsShatterSimMaterial } from './physics_shatter_sim_material.js';

/**
 * Gap kept between neighbouring pieces so touching cut faces start apart, in
 * metres.
 */
const PHYSICS_SHATTER_BODY_INSET = 0.001;

/** Smallest share of its size a piece keeps when inset. */
const PHYSICS_SHATTER_BODY_INSET_MIN_SCALE = 0.9;

/**
 * Steps after the blast during which pieces slide on each other without
 * friction, so bricks squeezed by their neighbours still leave the wall.
 */
export const PHYSICS_SHATTER_BODY_LAUNCH_STEPS = 12;

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
 * Creates the convex collider description of a hull with the material's
 * density, friction and bounciness.
 *
 * @param rapier Rapier module.
 * @param points Flat hull points in the body's space.
 * @param material Material physics.
 * @returns Collider description, or null when the hull is flat or degenerate.
 */
export function physicsShatterBodyColliderDesc(
  rapier: PhysicsRapierModule,
  points: Float32Array,
  material: PhysicsShatterSimMaterial,
): RAPIER.ColliderDesc | null {
  const desc = points.length >= 12 ? rapier.ColliderDesc.convexHull(points) : null;
  return desc
    ? desc.setDensity(material.density).setFriction(material.friction).setRestitution(material.restitution)
    : null;
}

/**
 * Switches a piece's collider between launch (frictionless against everything)
 * and the material's surface friction.
 *
 * @param rapier Rapier module.
 * @param collider Piece collider.
 * @param friction Material friction after the launch.
 * @param launching True while the piece leaves the wall.
 */
export function physicsShatterBodyLaunchFriction(
  rapier: PhysicsRapierModule,
  collider: RAPIER.Collider,
  friction: number,
  launching: boolean,
): void {
  const rules = rapier.CoefficientCombineRule;
  collider.setFriction(launching ? 0 : friction);
  collider.setFrictionCombineRule(launching ? rules.Min : rules.Average);
}

/**
 * Adds a fixed convex hull to the world.
 *
 * @param rapier Rapier module.
 * @param world Simulation world.
 * @param worldPoints Flat world-space hull points.
 * @param material Material physics.
 * @returns True when the hull was usable.
 */
export function physicsShatterBodyAddStaticHull(
  rapier: PhysicsRapierModule,
  world: RAPIER.World,
  worldPoints: Float32Array,
  material: PhysicsShatterSimMaterial,
): boolean {
  const desc = physicsShatterBodyColliderDesc(rapier, worldPoints, material);
  if (desc) world.createCollider(desc);
  return desc !== null;
}
