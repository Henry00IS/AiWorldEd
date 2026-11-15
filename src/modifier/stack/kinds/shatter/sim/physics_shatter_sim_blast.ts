import * as THREE from 'three';
import { PhysicsShatterRandom } from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_random.js';

/**
 * Share of the blast speed along the arrow; the rest pushes outward from the
 * impact point.
 */
const PHYSICS_SHATTER_BLAST_ARROW_SHARE = 0.65;

/** Spin in radians per second for each metre per second of blast speed. */
const PHYSICS_SHATTER_BLAST_SPIN_PER_SPEED = 0.8;

/** Random stream number of the blast spin, apart from the fracture streams. */
const PHYSICS_SHATTER_BLAST_SPIN_STREAM = 1_000_003;

/** Blast settings in world space. */
export interface PhysicsShatterSimBlastWorld {
  /** Impact point. */
  impactPoint: THREE.Vector3;
  /** Unit blast direction. */
  direction: THREE.Vector3;
  /** Speed given to a piece at the impact point, in metres per second. */
  strength: number;
  /** Distance at which the blast fades to nothing. */
  radius: number;
}

/**
 * Returns how strongly the blast reaches a point: one at the impact point,
 * falling linearly to zero at the radius.
 *
 * @param point World point.
 * @param blast World blast.
 * @returns Falloff in [0, 1].
 */
export function physicsShatterBlastFalloff(point: THREE.Vector3, blast: PhysicsShatterSimBlastWorld): number {
  return Math.max(0, 1 - point.distanceTo(blast.impactPoint) / Math.max(blast.radius, 1e-6));
}

/**
 * Returns the velocity the blast gives a piece: strength·(1 − d/r) along a
 * blend of the arrow and the outward direction from the impact point.
 *
 * @param centroid Piece centroid in the world.
 * @param blast World blast.
 * @returns Velocity in metres per second.
 */
export function physicsShatterBlastVelocity(
  centroid: THREE.Vector3,
  blast: PhysicsShatterSimBlastWorld,
): THREE.Vector3 {
  const speed = blast.strength * physicsShatterBlastFalloff(centroid, blast);
  const outward = centroid.clone().sub(blast.impactPoint);
  if (outward.lengthSq() < 1e-12) outward.copy(blast.direction);
  outward.normalize().multiplyScalar(1 - PHYSICS_SHATTER_BLAST_ARROW_SHARE);
  const heading = blast.direction.clone().multiplyScalar(PHYSICS_SHATTER_BLAST_ARROW_SHARE).add(outward);
  if (heading.lengthSq() < 1e-12) heading.copy(blast.direction);
  return heading.normalize().multiplyScalar(speed);
}

/**
 * Returns a seeded random spin for a piece, growing with its blast speed.
 *
 * @param seed Fracture seed.
 * @param pieceIndex Piece index.
 * @param speed Blast speed of the piece.
 * @returns Angular velocity in radians per second.
 */
export function physicsShatterBlastSpin(seed: number, pieceIndex: number, speed: number): THREE.Vector3 {
  const random = new PhysicsShatterRandom(seed, PHYSICS_SHATTER_BLAST_SPIN_STREAM + pieceIndex);
  const axis = new THREE.Vector3(random.between(-1, 1), random.between(-1, 1), random.between(-1, 1));
  if (axis.lengthSq() < 1e-6) axis.set(0, 1, 0);
  return axis.normalize().multiplyScalar(speed * PHYSICS_SHATTER_BLAST_SPIN_PER_SPEED * random.between(0.5, 1));
}
