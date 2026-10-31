import * as THREE from 'three';
import { snapDistanceToSegment } from './snap_segment_distance.js';
import { snapHingeAngularDistance, snapHingePointAtAngle, type SnapHingeCircle } from './snap_hinge_circle.js';

/**
 * Picks the candidate angle whose circle point is closest to a segment. Equal
 * distances prefer the angle nearer the reference angle.
 *
 * @param circle Hinge circle.
 * @param angles Candidate angles in radians.
 * @param segmentStart Segment start.
 * @param segmentEnd Segment end.
 * @param referenceAngle Angle to prefer on a tie.
 * @returns Chosen angle, or null when there are no candidates.
 */
export function chooseSnapHingeAngleForSegment(
  circle: SnapHingeCircle,
  angles: readonly number[],
  segmentStart: THREE.Vector3,
  segmentEnd: THREE.Vector3,
  referenceAngle: number,
): number | null {
  let bestAngle: number | null = null;
  let bestDistance = Infinity;
  let bestAngular = Infinity;
  for (const angle of angles) {
    const ranked = rankSegmentAngle(circle, angle, segmentStart, segmentEnd, referenceAngle);
    if (segmentAngleIsBetter(ranked.distance, ranked.angular, bestDistance, bestAngular)) {
      bestAngle = angle;
      bestDistance = ranked.distance;
      bestAngular = ranked.angular;
    }
  }
  return bestAngle;
}

/**
 * Measures one candidate against a segment.
 *
 * @param circle Hinge circle.
 * @param angle Candidate angle.
 * @param segmentStart Segment start.
 * @param segmentEnd Segment end.
 * @param referenceAngle Tie-break angle.
 * @returns Distance to the segment and angular distance to the reference.
 */
function rankSegmentAngle(
  circle: SnapHingeCircle,
  angle: number,
  segmentStart: THREE.Vector3,
  segmentEnd: THREE.Vector3,
  referenceAngle: number,
): { distance: number; angular: number } {
  const point = snapHingePointAtAngle(circle, angle);
  return {
    distance: snapDistanceToSegment(point, segmentStart, segmentEnd),
    angular: snapHingeAngularDistance(angle, referenceAngle),
  };
}

/**
 * Returns whether a candidate beats the current best.
 *
 * @param distance Distance from the candidate to the segment.
 * @param angular Angular distance to the reference angle.
 * @param bestDistance Best distance so far.
 * @param bestAngular Best angular distance so far.
 * @returns True when the candidate should replace the best.
 */
function segmentAngleIsBetter(distance: number, angular: number, bestDistance: number, bestAngular: number): boolean {
  if (distance < bestDistance - 1e-6) {
    return true;
  }
  return Math.abs(distance - bestDistance) <= 1e-6 && angular < bestAngular;
}
