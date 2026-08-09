import * as THREE from 'three';

/** Stable tangent basis for a plane normal. */
export interface UvTransformPlaneBasis {
  /** First tangent axis (unit). */
  uAxis: THREE.Vector3;
  /** Second tangent axis (unit). */
  vAxis: THREE.Vector3;
  /** Plane normal (unit). */
  normal: THREE.Vector3;
}

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const WORLD_RIGHT = new THREE.Vector3(1, 0, 0);

/**
 * Builds a right-handed unit tangent basis for a plane normal.
 *
 * @param planeNormal Plane normal (will be normalized).
 * @returns Unit normal plus U/V tangents.
 */
export function buildUvTransformPlaneBasis(planeNormal: THREE.Vector3): UvTransformPlaneBasis {
  const normal = planeNormal.clone().normalize();
  const seed = Math.abs(normal.dot(WORLD_UP)) > 0.9 ? WORLD_RIGHT : WORLD_UP;
  const uAxis = new THREE.Vector3().crossVectors(seed, normal).normalize();
  const vAxis = new THREE.Vector3().crossVectors(normal, uAxis).normalize();
  return { uAxis, vAxis, normal };
}

/**
 * Projects a world vector onto a plane basis, returning U/V components.
 *
 * @param worldVector Vector in world space.
 * @param basis Plane basis.
 * @returns Components along U and V.
 */
export function projectWorldVectorOntoPlaneBasis(
  worldVector: THREE.Vector3,
  basis: UvTransformPlaneBasis,
): { u: number; v: number } {
  return {
    u: worldVector.dot(basis.uAxis),
    v: worldVector.dot(basis.vAxis),
  };
}

/**
 * Rebuilds a world vector from plane-basis U/V components.
 *
 * @param u Component along U.
 * @param v Component along V.
 * @param basis Plane basis.
 * @returns World-space vector on the plane.
 */
export function composeWorldVectorFromPlaneBasis(u: number, v: number, basis: UvTransformPlaneBasis): THREE.Vector3 {
  return basis.uAxis.clone().multiplyScalar(u).add(basis.vAxis.clone().multiplyScalar(v));
}
