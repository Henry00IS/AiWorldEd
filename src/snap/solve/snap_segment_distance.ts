import * as THREE from 'three';

/**
 * Closest point on a segment to a query point.
 *
 * @param point Query point.
 * @param segmentStart Segment start.
 * @param segmentEnd Segment end.
 * @returns Closest point on the segment.
 */
export function snapClosestPointOnSegment(
  point: THREE.Vector3,
  segmentStart: THREE.Vector3,
  segmentEnd: THREE.Vector3,
): THREE.Vector3 {
  const span = segmentEnd.clone().sub(segmentStart);
  const lengthSquared = span.lengthSq();
  if (lengthSquared <= 1e-12) {
    return segmentStart.clone();
  }
  const unclamped = point.clone().sub(segmentStart).dot(span) / lengthSquared;
  const clamped = THREE.MathUtils.clamp(unclamped, 0, 1);
  return segmentStart.clone().addScaledVector(span, clamped);
}

/**
 * Distance from a point to a segment.
 *
 * @param point Query point.
 * @param segmentStart Segment start.
 * @param segmentEnd Segment end.
 * @returns Euclidean distance.
 */
export function snapDistanceToSegment(
  point: THREE.Vector3,
  segmentStart: THREE.Vector3,
  segmentEnd: THREE.Vector3,
): number {
  return point.distanceTo(snapClosestPointOnSegment(point, segmentStart, segmentEnd));
}
