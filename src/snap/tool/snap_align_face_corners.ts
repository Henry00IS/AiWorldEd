import * as THREE from 'three';

/** Dot product treated as the same unit normal. */
const PARALLEL_DOT = 1 - 1e-5;

/** Distance still treated as lying on the source plane. */
const PLANE_DISTANCE_EPSILON = 1e-4;

/** Squared distance that still counts as the same corner. */
const CORNER_EPSILON_SQUARED = 1e-10;

/** Triangle corners used to collect one planar face. */
export interface SnapAlignCornerTriangle {
  rootId: string;
  normal: THREE.Vector3;
  a: THREE.Vector3;
  b: THREE.Vector3;
  c: THREE.Vector3;
}

/**
 * Collects the corners of every cached triangle that lies on the source face.
 *
 * @param triangles Cached triangles.
 * @param source Triangle that was picked.
 * @returns Unique world corners of that face.
 */
export function snapAlignFaceCorners(
  triangles: readonly SnapAlignCornerTriangle[],
  source: SnapAlignCornerTriangle,
): THREE.Vector3[] {
  const corners: THREE.Vector3[] = [];
  for (const triangle of triangles) {
    appendWhenSameFace(corners, triangle, source);
  }
  return corners;
}

/**
 * Appends a triangle when it belongs to the picked face.
 *
 * @param corners Corners gathered so far.
 * @param triangle Candidate triangle.
 * @param source Picked triangle.
 */
function appendWhenSameFace(
  corners: THREE.Vector3[],
  triangle: SnapAlignCornerTriangle,
  source: SnapAlignCornerTriangle,
): void {
  if (!triangleSharesFace(triangle, source)) {
    return;
  }
  appendCorner(corners, triangle.a);
  appendCorner(corners, triangle.b);
  appendCorner(corners, triangle.c);
}

/**
 * Returns whether a triangle lies on the picked face.
 *
 * @param triangle Candidate triangle.
 * @param source Picked triangle.
 * @returns True when the root, normal, and plane match.
 */
function triangleSharesFace(triangle: SnapAlignCornerTriangle, source: SnapAlignCornerTriangle): boolean {
  if (triangle.rootId !== source.rootId) {
    return false;
  }
  if (triangle.normal.dot(source.normal) < PARALLEL_DOT) {
    return false;
  }
  return pointOnSourcePlane(triangle.a, source);
}

/**
 * Returns whether a point lies on the source plane.
 *
 * @param point World point.
 * @param source Picked triangle.
 * @returns True when the plane distance is inside the epsilon.
 */
function pointOnSourcePlane(point: THREE.Vector3, source: SnapAlignCornerTriangle): boolean {
  const offset = point.clone().sub(source.a);
  return Math.abs(offset.dot(source.normal)) <= PLANE_DISTANCE_EPSILON;
}

/**
 * Appends a corner when it is not already present.
 *
 * @param corners Corners gathered so far.
 * @param point Candidate corner.
 */
function appendCorner(corners: THREE.Vector3[], point: THREE.Vector3): void {
  if (corners.some((corner) => corner.distanceToSquared(point) <= CORNER_EPSILON_SQUARED)) {
    return;
  }
  corners.push(point.clone());
}
