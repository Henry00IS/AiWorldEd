import * as THREE from 'three';
import { snapHingeAngularDistance, type SnapHingeCircle } from './snap_hinge_circle.js';

/**
 * Angle that puts the rider on a face plane, or as close as the circle allows.
 *
 * @param circle Rider circle.
 * @param planePoint A point on the face plane.
 * @param planeNormal Unit face normal.
 * @param referenceAngle Angle preferred when the circle crosses the plane
 *   twice.
 * @returns Chosen angle in radians.
 */
export function snapHingeAngleToPlane(
  circle: SnapHingeCircle,
  planePoint: THREE.Vector3,
  planeNormal: THREE.Vector3,
  referenceAngle: number,
): number {
  const constant = circle.center.clone().sub(planePoint).dot(planeNormal);
  const cosineWeight = circle.radial.dot(planeNormal) * circle.radius;
  const sineWeight = circle.bitangent.dot(planeNormal) * circle.radius;
  const amplitude = Math.hypot(cosineWeight, sineWeight);
  if (amplitude <= 1e-8) {
    return referenceAngle;
  }
  const phase = Math.atan2(sineWeight, cosineWeight);
  return choosePlaneAngle(constant, amplitude, phase, referenceAngle);
}

/**
 * Solves k + S cos(theta - phase) = 0, or the closest angle when there is no
 * root.
 *
 * @param constant Plane offset of the circle center.
 * @param amplitude Amplitude of the circle's plane distance.
 * @param phase Phase of that distance.
 * @param referenceAngle Preferred angle.
 * @returns Chosen angle.
 */
function choosePlaneAngle(constant: number, amplitude: number, phase: number, referenceAngle: number): number {
  const ratio = THREE.MathUtils.clamp(-constant / amplitude, -1, 1);
  if (constant > amplitude + 1e-6) {
    return phase + Math.PI;
  }
  if (constant < -amplitude - 1e-6) {
    return phase;
  }
  const delta = Math.acos(ratio);
  return closerAngle(phase + delta, phase - delta, referenceAngle);
}

/**
 * Returns the angle closer to a reference.
 *
 * @param first First angle.
 * @param second Second angle.
 * @param referenceAngle Reference angle.
 * @returns The closer angle.
 */
function closerAngle(first: number, second: number, referenceAngle: number): number {
  if (snapHingeAngularDistance(first, referenceAngle) <= snapHingeAngularDistance(second, referenceAngle)) {
    return first;
  }
  return second;
}
