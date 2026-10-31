import * as THREE from 'three';

/** Squared length treated as a missing normal. */
const NORMAL_EPSILON_SQUARED = 1e-12;

/**
 * World slide along the negated target normal that brings the closest source
 * point onto the target plane. Other points stay on the side they started.
 *
 * @param points World points of the source face.
 * @param targetPoint Any world point on the target plane.
 * @param targetNormal Outward unit normal of the target plane.
 * @returns World translation. Zero when there is no point or no normal.
 */
export function snapSolveSeatDelta(
  points: readonly THREE.Vector3[],
  targetPoint: THREE.Vector3,
  targetNormal: THREE.Vector3,
): THREE.Vector3 {
  const unitTarget = unitTargetNormal(targetNormal);
  if (!unitTarget) {
    return new THREE.Vector3();
  }
  const distance = closestPlaneDistance(points, targetPoint, unitTarget);
  return unitTarget.negate().multiplyScalar(distance);
}

/**
 * Returns a unit target normal, or null when the normal is degenerate.
 *
 * @param normal Target normal.
 * @returns Unit normal, or null.
 */
function unitTargetNormal(normal: THREE.Vector3): THREE.Vector3 | null {
  if (normal.lengthSq() <= NORMAL_EPSILON_SQUARED) {
    return null;
  }
  return normal.clone().normalize();
}

/**
 * Returns the smallest signed distance from the points to the target plane.
 *
 * @param points World points.
 * @param targetPoint Point on the target plane.
 * @param unitNormal Unit target normal.
 * @returns Signed distance. Zero when there are no points.
 */
function closestPlaneDistance(
  points: readonly THREE.Vector3[],
  targetPoint: THREE.Vector3,
  unitNormal: THREE.Vector3,
): number {
  let closest = 0;
  let found = false;
  for (const point of points) {
    closest = takeCloserDistance(closest, found, point, targetPoint, unitNormal);
    found = true;
  }
  return closest;
}

/**
 * Keeps the smaller signed plane distance.
 *
 * @param closest Smallest distance so far.
 * @param found Whether a distance has been seen.
 * @param point Candidate point.
 * @param targetPoint Point on the target plane.
 * @param unitNormal Unit target normal.
 * @returns Smaller signed distance.
 */
function takeCloserDistance(
  closest: number,
  found: boolean,
  point: THREE.Vector3,
  targetPoint: THREE.Vector3,
  unitNormal: THREE.Vector3,
): number {
  const distance = point.clone().sub(targetPoint).dot(unitNormal);
  if (!found || distance < closest) {
    return distance;
  }
  return closest;
}
