import * as THREE from 'three';
import { chooseSnapHingeAngleForSegment } from './snap_hinge_angle_choice.js';
import { snapHingeAngleOfPoint, type SnapHingeCircle } from './snap_hinge_circle.js';

/**
 * Angle that brings the rider circle as close as possible to a segment.
 *
 * @param circle Hinge circle.
 * @param segmentStart Segment start.
 * @param segmentEnd Segment end.
 * @param referenceAngle Angle preferred when two solutions match.
 * @returns Chosen angle in radians.
 */
export function snapHingeAngleToSegment(
  circle: SnapHingeCircle,
  segmentStart: THREE.Vector3,
  segmentEnd: THREE.Vector3,
  referenceAngle: number,
): number {
  const angles = collectSegmentAngleCandidates(circle, segmentStart, segmentEnd);
  const chosen = chooseSnapHingeAngleForSegment(circle, angles, segmentStart, segmentEnd, referenceAngle);
  if (chosen === null) {
    return referenceAngle;
  }
  return chosen;
}

/**
 * Gathers endpoint angles and the angle toward the closest planar foot.
 *
 * @param circle Hinge circle.
 * @param segmentStart Segment start.
 * @param segmentEnd Segment end.
 * @returns Candidate angles.
 */
function collectSegmentAngleCandidates(
  circle: SnapHingeCircle,
  segmentStart: THREE.Vector3,
  segmentEnd: THREE.Vector3,
): number[] {
  const angles = [snapHingeAngleOfPoint(circle, segmentStart), snapHingeAngleOfPoint(circle, segmentEnd)];
  const footAngle = footAngleOnSegment(circle, segmentStart, segmentEnd);
  if (footAngle !== null) {
    angles.push(footAngle);
  }
  return angles;
}

/**
 * Angle toward the segment point closest to the circle center, in the hinge
 * plane.
 *
 * @param circle Hinge circle.
 * @param segmentStart Segment start.
 * @param segmentEnd Segment end.
 * @returns Angle, or null when the foot is the center.
 */
function footAngleOnSegment(
  circle: SnapHingeCircle,
  segmentStart: THREE.Vector3,
  segmentEnd: THREE.Vector3,
): number | null {
  const start = projectRelative(circle, segmentStart);
  const end = projectRelative(circle, segmentEnd);
  const span = end.sub(start.clone());
  const lengthSquared = span.lengthSq();
  if (lengthSquared <= 1e-12) {
    return null;
  }
  const clamped = THREE.MathUtils.clamp(-start.dot(span) / lengthSquared, 0, 1);
  const foot = start.addScaledVector(span, clamped);
  if (foot.lengthSq() <= 1e-12) {
    return null;
  }
  return Math.atan2(foot.dot(circle.bitangent), foot.dot(circle.radial));
}

/**
 * Projects a point into the hinge plane, relative to the circle center.
 *
 * @param circle Hinge circle.
 * @param point World point.
 * @returns Planar offset from the center.
 */
function projectRelative(circle: SnapHingeCircle, point: THREE.Vector3): THREE.Vector3 {
  const offset = point.clone().sub(circle.center);
  return offset.addScaledVector(circle.direction, -offset.dot(circle.direction));
}
