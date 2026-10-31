import * as THREE from 'three';

/** Circle traced by a rider point rotating about a hinge line. */
export interface SnapHingeCircle {
  center: THREE.Vector3;
  direction: THREE.Vector3;
  radial: THREE.Vector3;
  bitangent: THREE.Vector3;
  radius: number;
}

/**
 * Builds the circle a rider sweeps about a hinge. Returns null when the rider
 * already lies on the hinge line.
 *
 * @param hingePoint A point on the hinge line.
 * @param hingeDirection Hinge direction. It is normalized.
 * @param riderPoint World point that orbits the hinge.
 * @returns Circle frame, or null when the radius is zero.
 */
export function buildSnapHingeCircle(
  hingePoint: THREE.Vector3,
  hingeDirection: THREE.Vector3,
  riderPoint: THREE.Vector3,
): SnapHingeCircle | null {
  const direction = hingeDirection.clone().normalize();
  const offset = riderPoint.clone().sub(hingePoint);
  const center = hingePoint.clone().addScaledVector(direction, offset.dot(direction));
  const radialVector = riderPoint.clone().sub(center);
  const radius = radialVector.length();
  if (radius <= 1e-8) {
    return null;
  }
  const radial = radialVector.multiplyScalar(1 / radius);
  const bitangent = direction.clone().cross(radial).normalize();
  return { center, direction, radial, bitangent, radius };
}

/**
 * Signed angle of a world point about the hinge, zero at the rider.
 *
 * @param circle Hinge circle.
 * @param point World point.
 * @returns Angle in radians, in the range of atan2.
 */
export function snapHingeAngleOfPoint(circle: SnapHingeCircle, point: THREE.Vector3): number {
  const planar = projectOntoHingePlane(circle, point);
  return Math.atan2(planar.dot(circle.bitangent), planar.dot(circle.radial));
}

/**
 * World point on the rider circle at a signed angle.
 *
 * @param circle Hinge circle.
 * @param angle Signed angle in radians from the rider.
 * @returns World point on the circle.
 */
export function snapHingePointAtAngle(circle: SnapHingeCircle, angle: number): THREE.Vector3 {
  const point = circle.center.clone();
  point.addScaledVector(circle.radial, Math.cos(angle) * circle.radius);
  point.addScaledVector(circle.bitangent, Math.sin(angle) * circle.radius);
  return point;
}

/**
 * Absolute smallest difference between two angles.
 *
 * @param first First angle in radians.
 * @param second Second angle in radians.
 * @returns Distance in radians, from 0 to pi.
 */
export function snapHingeAngularDistance(first: number, second: number): number {
  const wrapped = Math.atan2(Math.sin(first - second), Math.cos(first - second));
  return Math.abs(wrapped);
}

/**
 * Projects a world point onto the plane of the hinge circle.
 *
 * @param circle Hinge circle.
 * @param point World point.
 * @returns Vector from the circle center to the projected point.
 */
function projectOntoHingePlane(circle: SnapHingeCircle, point: THREE.Vector3): THREE.Vector3 {
  const offset = point.clone().sub(circle.center);
  const along = offset.dot(circle.direction);
  return offset.addScaledVector(circle.direction, -along);
}
