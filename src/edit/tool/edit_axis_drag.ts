import * as THREE from 'three';

/**
 * Returns the parameter of the point on an infinite line closest to a ray, so a
 * pointer can drag a value along a world axis.
 *
 * @param lineOrigin Point on the line.
 * @param lineDirection Unit line direction.
 * @param rayOrigin Ray origin.
 * @param rayDirection Ray direction.
 * @returns Signed distance along the line, or null when the ray looks straight
 *   down the line.
 */
export function editAxisDragParameter(
  lineOrigin: THREE.Vector3,
  lineDirection: THREE.Vector3,
  rayOrigin: THREE.Vector3,
  rayDirection: THREE.Vector3,
): number | null {
  const ray = rayDirection.clone().normalize();
  const along = lineDirection.dot(ray);
  const denominator = 1 - along * along;
  if (denominator < 1e-6) return null;
  const between = new THREE.Vector3().subVectors(lineOrigin, rayOrigin);
  return (along * between.dot(ray) - between.dot(lineDirection)) / denominator;
}

/**
 * Snaps a distance to whole grid steps.
 *
 * @param distance Raw distance.
 * @param interval Grid interval; values at or below zero leave it unchanged.
 * @param snapEnabled Whether snapping applies to this sample.
 * @returns Snapped or original distance.
 */
export function editSnapDistanceToGrid(distance: number, interval: number, snapEnabled: boolean): number {
  if (!snapEnabled || !(interval > 0)) return distance;
  return Math.round(distance / interval) * interval;
}
