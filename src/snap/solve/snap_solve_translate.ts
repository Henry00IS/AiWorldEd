import * as THREE from 'three';

/**
 * World delta that moves a source point onto a target point.
 *
 * @param sourcePoint World point that should land on the target.
 * @param targetPoint World point to land on.
 * @returns Delta from the source to the target.
 */
export function snapSolveTranslateDelta(sourcePoint: THREE.Vector3, targetPoint: THREE.Vector3): THREE.Vector3 {
  return targetPoint.clone().sub(sourcePoint);
}
