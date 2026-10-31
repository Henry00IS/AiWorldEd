import * as THREE from 'three';

/** Cross-product length treated as parallel lines. */
const PARALLEL_CROSS_LENGTH = 1e-5;

/** Absolute plane distance treated as coplanar. */
const COPLANAR_DISTANCE = 1e-4;

/**
 * Unit normal of the plane that contains a hinge line and a target edge.
 * Returns null when the lines are skew.
 *
 * @param hingePoint Point on the hinge.
 * @param hingeDirection Unit hinge direction.
 * @param segmentStart Target edge start.
 * @param segmentEnd Target edge end.
 * @returns Unit plane normal, or null when no shared plane exists.
 */
export function snapHingeTargetPlaneNormal(
  hingePoint: THREE.Vector3,
  hingeDirection: THREE.Vector3,
  segmentStart: THREE.Vector3,
  segmentEnd: THREE.Vector3,
): THREE.Vector3 | null {
  const edgeDirection = segmentEnd.clone().sub(segmentStart);
  if (edgeDirection.lengthSq() <= 1e-12) {
    return null;
  }
  edgeDirection.normalize();
  if (hingeDirection.clone().cross(edgeDirection).length() <= PARALLEL_CROSS_LENGTH) {
    return planeNormalForParallelEdge(hingePoint, hingeDirection, segmentStart);
  }
  return planeNormalForSkewTest(hingePoint, hingeDirection, edgeDirection, segmentStart);
}

/**
 * Plane normal for a target edge parallel to the hinge.
 *
 * @param hingePoint Point on the hinge.
 * @param hingeDirection Unit hinge direction.
 * @param segmentStart Point on the target edge.
 * @returns Unit normal, or null when the edge lies on the hinge line.
 */
function planeNormalForParallelEdge(
  hingePoint: THREE.Vector3,
  hingeDirection: THREE.Vector3,
  segmentStart: THREE.Vector3,
): THREE.Vector3 | null {
  const offset = segmentStart.clone().sub(hingePoint);
  const lateral = offset.addScaledVector(hingeDirection, -offset.dot(hingeDirection));
  if (lateral.lengthSq() <= 1e-12) {
    return null;
  }
  return hingeDirection.clone().cross(lateral).normalize();
}

/**
 * Plane normal for a non-parallel edge, or null when the edge misses the plane.
 *
 * @param hingePoint Point on the hinge.
 * @param hingeDirection Unit hinge direction.
 * @param edgeDirection Unit target edge direction.
 * @param segmentStart Point on the target edge.
 * @returns Unit normal, or null when the lines are skew.
 */
function planeNormalForSkewTest(
  hingePoint: THREE.Vector3,
  hingeDirection: THREE.Vector3,
  edgeDirection: THREE.Vector3,
  segmentStart: THREE.Vector3,
): THREE.Vector3 | null {
  const normal = hingeDirection.clone().cross(edgeDirection).normalize();
  const distance = segmentStart.clone().sub(hingePoint).dot(normal);
  if (Math.abs(distance) > COPLANAR_DISTANCE) {
    return null;
  }
  return normal;
}
