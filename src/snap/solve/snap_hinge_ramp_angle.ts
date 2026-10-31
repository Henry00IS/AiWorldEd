import * as THREE from 'three';
import { snapDistanceToSegment } from './snap_segment_distance.js';
import { snapHingeAngularDistance, snapHingePointAtAngle, type SnapHingeCircle } from './snap_hinge_circle.js';
import { snapHingeSignedAngle } from './snap_hinge_signed_angle.js';
import { snapHingeTargetPlaneNormal } from './snap_hinge_target_plane.js';

/**
 * How far a face normal may tilt off perpendicular before the hinge is treated
 * as outside the face.
 */
const HINGE_IN_FACE_DOT = 1e-3;

/**
 * Angle that lays the face containing the hinge onto the plane of a target
 * edge. Returns null when the lines are skew or the hinge does not lie in the
 * face.
 *
 * @param circle Rider circle.
 * @param faceNormal Outward normal of the face that contains the hinge and the
 *   rider.
 * @param hingePoint Point on the hinge.
 * @param segmentStart Target edge start.
 * @param segmentEnd Target edge end.
 * @param referenceAngle Angle preferred when both flips match.
 * @returns Rotation angle from the current pose, or null.
 */
export function snapHingeRampAngle(
  circle: SnapHingeCircle,
  faceNormal: THREE.Vector3,
  hingePoint: THREE.Vector3,
  segmentStart: THREE.Vector3,
  segmentEnd: THREE.Vector3,
  referenceAngle: number,
): number | null {
  if (Math.abs(faceNormal.dot(circle.direction)) > HINGE_IN_FACE_DOT) {
    return null;
  }
  const planeNormal = snapHingeTargetPlaneNormal(hingePoint, circle.direction, segmentStart, segmentEnd);
  if (!planeNormal) {
    return null;
  }
  return chooseRampFlip(circle, faceNormal, planeNormal, segmentStart, segmentEnd, referenceAngle);
}

/**
 * Picks the smaller flip of the face onto the target plane.
 *
 * @param circle Rider circle.
 * @param faceNormal Current face normal.
 * @param planeNormal Target plane normal.
 * @param segmentStart Target edge start.
 * @param segmentEnd Target edge end.
 * @param referenceAngle Tie-break angle.
 * @returns Chosen angle.
 */
function chooseRampFlip(
  circle: SnapHingeCircle,
  faceNormal: THREE.Vector3,
  planeNormal: THREE.Vector3,
  segmentStart: THREE.Vector3,
  segmentEnd: THREE.Vector3,
  referenceAngle: number,
): number {
  const towardNormal = snapHingeSignedAngle(faceNormal, planeNormal, circle.direction);
  const towardFlipped = snapHingeSignedAngle(faceNormal, planeNormal.clone().negate(), circle.direction);
  if (rampAngleIsBetter(circle, towardNormal, towardFlipped, segmentStart, segmentEnd, referenceAngle)) {
    return towardNormal;
  }
  return towardFlipped;
}

/**
 * Returns whether the first ramp angle should win.
 *
 * @param circle Rider circle.
 * @param first First candidate angle.
 * @param second Second candidate angle.
 * @param segmentStart Target edge start.
 * @param segmentEnd Target edge end.
 * @param referenceAngle Tie-break angle.
 * @returns True when the first angle wins.
 */
function rampAngleIsBetter(
  circle: SnapHingeCircle,
  first: number,
  second: number,
  segmentStart: THREE.Vector3,
  segmentEnd: THREE.Vector3,
  referenceAngle: number,
): boolean {
  const firstMagnitude = Math.abs(normalizeSignedAngle(first));
  const secondMagnitude = Math.abs(normalizeSignedAngle(second));
  if (Math.abs(firstMagnitude - secondMagnitude) > 1e-4) {
    return firstMagnitude < secondMagnitude;
  }
  return rampTieBreak(circle, first, second, segmentStart, segmentEnd, referenceAngle);
}

/**
 * Breaks a magnitude tie by rider distance, then by the reference angle.
 *
 * @param circle Rider circle.
 * @param first First candidate angle.
 * @param second Second candidate angle.
 * @param segmentStart Target edge start.
 * @param segmentEnd Target edge end.
 * @param referenceAngle Tie-break angle.
 * @returns True when the first angle wins the tie.
 */
function rampTieBreak(
  circle: SnapHingeCircle,
  first: number,
  second: number,
  segmentStart: THREE.Vector3,
  segmentEnd: THREE.Vector3,
  referenceAngle: number,
): boolean {
  const firstDistance = snapDistanceToSegment(snapHingePointAtAngle(circle, first), segmentStart, segmentEnd);
  const secondDistance = snapDistanceToSegment(snapHingePointAtAngle(circle, second), segmentStart, segmentEnd);
  if (Math.abs(firstDistance - secondDistance) > 1e-6) {
    return firstDistance < secondDistance;
  }
  return snapHingeAngularDistance(first, referenceAngle) <= snapHingeAngularDistance(second, referenceAngle);
}

/**
 * Wraps an angle into the range -pi to pi.
 *
 * @param angle Angle in radians.
 * @returns Wrapped angle.
 */
function normalizeSignedAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}
