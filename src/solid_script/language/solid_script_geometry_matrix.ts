import * as THREE from 'three';
import type { SolidScriptGeometryLeaf } from './solid_script_geometry.js';

/** Closest a rebuilt point may be and still count as the same transform. */
const SOLID_SCRIPT_GEOMETRY_MATRIX_SAME = 1e-6;

/**
 * Returns the transform that takes every corner of one solid or mesh onto the
 * matching corner of another, when both have the same faces and the corners
 * move as one.
 *
 * @param from Solid or mesh as first seen.
 * @param to Replacement.
 * @returns Matrix, or null when the faces differ or the corners do not share a
 *   transform.
 */
export function solidScriptGeometryLeafMatrix(
  from: SolidScriptGeometryLeaf,
  to: SolidScriptGeometryLeaf,
): THREE.Matrix4 | null {
  if (from.points.length !== to.points.length || from.points.length === 0) return null;
  if (from.faces.length !== to.faces.length) return null;
  if (!from.faces.every((loop, index) => solidScriptGeometryLoopSame(loop, to.faces[index]!))) return null;
  return solidScriptGeometryPointsMatrix(from.points, to.points);
}

/**
 * Tells whether two face loops list the same corners in the same order.
 *
 * @param a Loop.
 * @param b Loop.
 * @returns True when they do.
 */
function solidScriptGeometryLoopSame(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((corner, index) => corner === b[index]);
}

/**
 * Returns the transform that takes each point onto the matching point, or
 * nothing when they do not share one.
 *
 * @param from Points.
 * @param to Matching points, the same number.
 * @returns Matrix, or null.
 */
export function solidScriptGeometryPointsMatrix(
  from: readonly THREE.Vector3[],
  to: readonly THREE.Vector3[],
): THREE.Matrix4 | null {
  const matrix = solidScriptGeometryPointsAffine(from, to);
  if (!matrix) return null;
  const point = new THREE.Vector3();
  for (let index = 0; index < from.length; index++) {
    if (point.copy(from[index]!).applyMatrix4(matrix).distanceTo(to[index]!) > SOLID_SCRIPT_GEOMETRY_MATRIX_SAME)
      return null;
  }
  return matrix;
}

/**
 * Builds an affine map from matching points: a move when every point travels
 * the same way, otherwise the map of four basis points.
 *
 * @param from Points.
 * @param to Matching points.
 * @returns Matrix, or null when a basis cannot be made.
 */
function solidScriptGeometryPointsAffine(
  from: readonly THREE.Vector3[],
  to: readonly THREE.Vector3[],
): THREE.Matrix4 | null {
  const delta = to[0]!.clone().sub(from[0]!);
  if (
    from.every((point, index) => point.clone().add(delta).distanceTo(to[index]!) <= SOLID_SCRIPT_GEOMETRY_MATRIX_SAME)
  )
    return new THREE.Matrix4().makeTranslation(delta.x, delta.y, delta.z);
  const bases = solidScriptGeometryPointBases(from, to);
  const source = solidScriptGeometryPointBasis(bases.from);
  if (Math.abs(source.determinant()) < SOLID_SCRIPT_GEOMETRY_MATRIX_SAME) return null;
  return solidScriptGeometryPointBasis(bases.to).multiply(source.invert());
}

/** Four homogeneous basis points. */
type SolidScriptGeometryBasis = [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3];

/**
 * Picks four non-coplanar basis points, inventing a fourth along the face
 * normal when every given point lies in a plane.
 *
 * @param from Points.
 * @param to Matching points.
 * @returns Basis of each list.
 */
function solidScriptGeometryPointBases(
  from: readonly THREE.Vector3[],
  to: readonly THREE.Vector3[],
): { from: SolidScriptGeometryBasis; to: SolidScriptGeometryBasis } {
  const i = solidScriptGeometryPointAway(from, 0);
  const j = solidScriptGeometryPointSkew(from, 0, i);
  const k = solidScriptGeometryPointOff(from, 0, i, j);
  if (k >= 0) return { from: [from[0]!, from[i]!, from[j]!, from[k]!], to: [to[0]!, to[i]!, to[j]!, to[k]!] };
  const lift = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): THREE.Vector3 =>
    a.clone().add(new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)));
  return {
    from: [from[0]!, from[i]!, from[j]!, lift(from[0]!, from[i]!, from[j]!)],
    to: [to[0]!, to[i]!, to[j]!, lift(to[0]!, to[i]!, to[j]!)],
  };
}

/**
 * First point after the start that is not in the same place.
 *
 * @param points Points.
 * @param start First index.
 * @returns Later index, or the last point when all sit together.
 */
function solidScriptGeometryPointAway(points: readonly THREE.Vector3[], start: number): number {
  const found = points.findIndex(
    (point, index) => index > start && point.distanceTo(points[start]!) > SOLID_SCRIPT_GEOMETRY_MATRIX_SAME,
  );
  return found >= 0 ? found : points.length - 1;
}

/**
 * First point not on the line of two others.
 *
 * @param points Points.
 * @param a First index.
 * @param b Second index.
 * @returns Later index, or the last point when all are in line.
 */
function solidScriptGeometryPointSkew(points: readonly THREE.Vector3[], a: number, b: number): number {
  const along = points[b]!.clone().sub(points[a]!);
  const found = points.findIndex((point, index) => {
    if (index <= b) return false;
    const offset = point.clone().sub(points[a]!);
    return offset.cross(along).length() > SOLID_SCRIPT_GEOMETRY_MATRIX_SAME;
  });
  return found >= 0 ? found : points.length - 1;
}

/**
 * First point not on the plane of three others, or -1 when every point is on
 * it.
 *
 * @param points Points.
 * @param a First index.
 * @param b Second index.
 * @param c Third index.
 * @returns Later index, or -1.
 */
function solidScriptGeometryPointOff(points: readonly THREE.Vector3[], a: number, b: number, c: number): number {
  const normal = new THREE.Vector3().crossVectors(
    points[b]!.clone().sub(points[a]!),
    points[c]!.clone().sub(points[a]!),
  );
  return points.findIndex(
    (point, index) =>
      index > c && Math.abs(point.clone().sub(points[a]!).dot(normal)) > SOLID_SCRIPT_GEOMETRY_MATRIX_SAME,
  );
}

/**
 * Homogeneous matrix whose columns are four points.
 *
 * @param points Four points.
 * @returns Matrix.
 */
function solidScriptGeometryPointBasis(points: SolidScriptGeometryBasis): THREE.Matrix4 {
  return new THREE.Matrix4().set(
    points[0].x,
    points[1].x,
    points[2].x,
    points[3].x,
    points[0].y,
    points[1].y,
    points[2].y,
    points[3].y,
    points[0].z,
    points[1].z,
    points[2].z,
    points[3].z,
    1,
    1,
    1,
    1,
  );
}
