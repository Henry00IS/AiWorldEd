import * as THREE from 'three';

/**
 * Epsilon used when testing collinear or parallel point sets.
 */
const PLANE_POINT_EPSILON = 1e-8;

/**
 * Builds a vertical clipping plane through two world points.
 * The plane contains both points and is parallel to world up when possible.
 * @param pointA First world-space point on the plane.
 * @param pointB Second world-space point on the plane.
 * @param worldUp Preferred up axis (defaults to +Y).
 * @returns A plane, or null when the points are too close or degenerate.
 */
export function buildVerticalPlaneFromTwoPoints(
  pointA: THREE.Vector3,
  pointB: THREE.Vector3,
  worldUp: THREE.Vector3 = new THREE.Vector3(0, 1, 0)
): THREE.Plane | null {
  const edge = new THREE.Vector3().subVectors(pointB, pointA);
  if (edge.lengthSq() < PLANE_POINT_EPSILON) return null;
  const normal = computeVerticalPlaneNormal(edge, worldUp);
  if (normal.lengthSq() < PLANE_POINT_EPSILON) return null;
  normal.normalize();
  return new THREE.Plane().setFromNormalAndCoplanarPoint(normal, pointA);
}

/**
 * Builds an arbitrary plane from three non-collinear world points.
 * @param pointA First point on the plane.
 * @param pointB Second point on the plane.
 * @param pointC Third point on the plane.
 * @returns A plane, or null when the points are collinear or coincident.
 */
export function buildPlaneFromThreePoints(
  pointA: THREE.Vector3,
  pointB: THREE.Vector3,
  pointC: THREE.Vector3
): THREE.Plane | null {
  const ab = new THREE.Vector3().subVectors(pointB, pointA);
  const ac = new THREE.Vector3().subVectors(pointC, pointA);
  if (ab.lengthSq() < PLANE_POINT_EPSILON) return null;
  if (ac.lengthSq() < PLANE_POINT_EPSILON) return null;
  const normal = new THREE.Vector3().crossVectors(ab, ac);
  if (normal.lengthSq() < PLANE_POINT_EPSILON) return null;
  normal.normalize();
  return new THREE.Plane().setFromNormalAndCoplanarPoint(normal, pointA);
}

/**
 * Builds a plane from two or three placement points.
 * Two points use a vertical plane; three points use a free orientation.
 * @param points Ordered world points (length 2 or 3).
 * @param worldUp Up axis for the two-point vertical case.
 * @returns A plane, or null when the set is invalid.
 */
export function buildPlaneFromPlacementPoints(
  points: THREE.Vector3[],
  worldUp: THREE.Vector3 = new THREE.Vector3(0, 1, 0)
): THREE.Plane | null {
  if (points.length >= 3) {
    return buildPlaneFromThreePoints(points[0], points[1], points[2]);
  }
  if (points.length === 2) {
    return buildVerticalPlaneFromTwoPoints(points[0], points[1], worldUp);
  }
  return null;
}

/**
 * Returns a plane with inverted normal and constant (swaps half-spaces).
 * @param plane The source plane.
 * @returns A new flipped plane.
 */
export function flipPlane(plane: THREE.Plane): THREE.Plane {
  return new THREE.Plane(plane.normal.clone().negate(), -plane.constant);
}

/**
 * Converts a Three.js plane to the CSG clipper form n·x = constant.
 * Three.js stores n·x + constant = 0, so CSG constant is -plane.constant.
 * @param plane The Three.js plane.
 * @returns Normal and plane constant for CsgClipper.
 */
export function planeToCsgForm(
  plane: THREE.Plane
): { normal: THREE.Vector3; constant: number } {
  return {
    normal: plane.normal.clone().normalize(),
    constant: -plane.constant
  };
}

/**
 * Chooses a normal for a vertical plane containing the given edge.
 * @param edge Direction between the two placement points.
 * @param worldUp Preferred world up axis.
 * @returns Unnormalized normal, or zero if fully degenerate.
 */
function computeVerticalPlaneNormal(
  edge: THREE.Vector3,
  worldUp: THREE.Vector3
): THREE.Vector3 {
  const primary = new THREE.Vector3().crossVectors(edge, worldUp);
  if (primary.lengthSq() >= PLANE_POINT_EPSILON) {
    return primary;
  }
  const fallbackUp = pickFallbackAxis(edge);
  return new THREE.Vector3().crossVectors(edge, fallbackUp);
}

/**
 * Picks a fallback axis when edge is nearly parallel to world up.
 * @param edge Edge direction.
 * @returns A unit axis not parallel to the edge.
 */
function pickFallbackAxis(edge: THREE.Vector3): THREE.Vector3 {
  const absX = Math.abs(edge.x);
  const absZ = Math.abs(edge.z);
  if (absX < absZ) {
    return new THREE.Vector3(1, 0, 0);
  }
  return new THREE.Vector3(0, 0, 1);
}
