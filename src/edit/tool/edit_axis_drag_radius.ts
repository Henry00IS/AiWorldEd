import * as THREE from 'three';

/**
 * Returns how far a point lies from a ray's line, so a pointer can grow a value
 * by moving away from a centre in any view.
 *
 * @param point Centre point.
 * @param rayOrigin Ray origin.
 * @param rayDirection Ray direction.
 * @returns Perpendicular distance.
 */
export function editPointDistanceToRay(
  point: THREE.Vector3,
  rayOrigin: THREE.Vector3,
  rayDirection: THREE.Vector3,
): number {
  const direction = rayDirection.clone().normalize();
  return new THREE.Vector3().subVectors(point, rayOrigin).cross(direction).length();
}
