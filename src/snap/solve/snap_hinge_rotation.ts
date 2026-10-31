import * as THREE from 'three';

/**
 * Rotation that swings a point around a hinge.
 *
 * @param direction Hinge direction.
 * @param angle Signed angle in radians.
 * @returns Rotation quaternion. Identity when the direction is degenerate.
 */
export function snapHingeRotationQuaternion(direction: THREE.Vector3, angle: number): THREE.Quaternion {
  if (direction.lengthSq() <= 1e-12) {
    return new THREE.Quaternion();
  }
  return new THREE.Quaternion().setFromAxisAngle(direction.clone().normalize(), angle);
}

/**
 * Rotates a world point around a hinge. Distance to the hinge stays the same.
 *
 * @param point World point to rotate.
 * @param hingePoint World point on the hinge.
 * @param hingeDirection World hinge direction.
 * @param angle Signed angle in radians.
 * @returns Rotated world point.
 */
export function snapHingeRotatePoint(
  point: THREE.Vector3,
  hingePoint: THREE.Vector3,
  hingeDirection: THREE.Vector3,
  angle: number,
): THREE.Vector3 {
  const rotation = snapHingeRotationQuaternion(hingeDirection, angle);
  return point.clone().sub(hingePoint).applyQuaternion(rotation).add(hingePoint);
}
