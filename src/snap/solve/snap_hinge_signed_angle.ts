import * as THREE from 'three';

/**
 * Signed angle from one vector to another about a unit axis.
 *
 * @param from Start direction.
 * @param to End direction.
 * @param axis Unit axis.
 * @returns Signed angle in radians.
 */
export function snapHingeSignedAngle(from: THREE.Vector3, to: THREE.Vector3, axis: THREE.Vector3): number {
  const fromPlanar = componentPerpendicularToAxis(from, axis);
  const toPlanar = componentPerpendicularToAxis(to, axis);
  if (fromPlanar.lengthSq() <= 1e-12 || toPlanar.lengthSq() <= 1e-12) {
    return 0;
  }
  fromPlanar.normalize();
  toPlanar.normalize();
  const cross = fromPlanar.cross(toPlanar);
  return Math.atan2(axis.dot(cross), fromPlanarDot(from, to, axis));
}

/**
 * Removes the component parallel to an axis.
 *
 * @param vector Source vector.
 * @param axis Unit axis.
 * @returns Perpendicular component.
 */
function componentPerpendicularToAxis(vector: THREE.Vector3, axis: THREE.Vector3): THREE.Vector3 {
  return vector.clone().addScaledVector(axis, -vector.dot(axis));
}

/**
 * Dot product of the two planar components. Recalculated because the cross
 * product consumes the first planar vector.
 *
 * @param from Start direction.
 * @param to End direction.
 * @param axis Unit axis.
 * @returns Dot of the normalized planar components.
 */
function fromPlanarDot(from: THREE.Vector3, to: THREE.Vector3, axis: THREE.Vector3): number {
  const fromPlanar = componentPerpendicularToAxis(from, axis).normalize();
  const toPlanar = componentPerpendicularToAxis(to, axis).normalize();
  return fromPlanar.dot(toPlanar);
}
