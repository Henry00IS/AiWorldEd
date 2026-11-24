import * as THREE from 'three';
import { SOLID_SCRIPT_GEOMETRY_EPSILON, type SolidScriptFaceFacts } from './solid_script_geometry.js';

/**
 * Widest gap between the X of a face's direction and minus the X of a face that
 * covers it: two unit directions whose dot is below -1 plus the epsilon differ
 * from opposite by less than this along every axis.
 */
const SOLID_SCRIPT_GEOMETRY_OUTSIDE_REACH = Math.sqrt(2 * SOLID_SCRIPT_GEOMETRY_EPSILON + 4e-9) + 1e-12;

/**
 * Keeps the faces that show: drops a face that lies back to back against a face
 * of another solid or mesh in the list, such as where the brushes of a Rotate
 * Extrude ring meet. A face counts as covered when the other face holds its
 * center. Only faces whose directions are nearly opposite are compared, found
 * by the X of their directions, so a large list is not compared pair by pair.
 *
 * @param faces Faces.
 * @returns The faces not covered by another one in the list.
 */
export function solidScriptGeometryFacesOutside(faces: readonly SolidScriptFaceFacts[]): SolidScriptFaceFacts[] {
  const unit = faces.filter((face) => Math.abs(face.normal.lengthSq() - 1) <= 1e-9);
  const rest = faces.filter((face) => Math.abs(face.normal.lengthSq() - 1) > 1e-9);
  const sorted = [...unit].sort((a, b) => a.normal.x - b.normal.x);
  const xs = sorted.map((face) => face.normal.x);
  const covered = (face: SolidScriptFaceFacts, other: SolidScriptFaceFacts) =>
    other.leaf !== face.leaf && solidScriptGeometryFaceCovers(other, face);
  return faces.filter((face) => {
    if (rest.some((other) => covered(face, other))) return false;
    const pool = Math.abs(face.normal.lengthSq() - 1) <= 1e-9 ? solidScriptGeometryOutsideNear(sorted, xs, face) : unit;
    return !pool.some((other) => covered(face, other));
  });
}

/**
 * Lists the faces whose direction X lies near minus the X of a face's
 * direction, the only ones that may face it back to back.
 *
 * @param sorted Faces with unit directions, by direction X.
 * @param xs Direction X of each sorted face.
 * @param face Face.
 * @returns Faces to compare.
 */
function solidScriptGeometryOutsideNear(
  sorted: readonly SolidScriptFaceFacts[],
  xs: readonly number[],
  face: SolidScriptFaceFacts,
): readonly SolidScriptFaceFacts[] {
  const low = solidScriptGeometryOutsideFirst(xs, -face.normal.x - SOLID_SCRIPT_GEOMETRY_OUTSIDE_REACH);
  const high = solidScriptGeometryOutsideFirst(xs, -face.normal.x + SOLID_SCRIPT_GEOMETRY_OUTSIDE_REACH, true);
  return sorted.slice(low, high);
}

/**
 * Finds the first place in a sorted list at or past a value.
 *
 * @param xs Sorted values.
 * @param value Value.
 * @param past True to pass values equal to it too.
 * @returns Index.
 */
function solidScriptGeometryOutsideFirst(xs: readonly number[], value: number, past = false): number {
  let low = 0;
  let high = xs.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (xs[middle]! < value || (past && xs[middle] === value)) low = middle + 1;
    else high = middle;
  }
  return low;
}

/**
 * Tells whether a face lies on the same plane as another, facing the other way,
 * with the other's center inside it.
 *
 * @param cover Face that may cover.
 * @param face Face that may be covered.
 * @returns True when cover is back to back with face over its center.
 */
function solidScriptGeometryFaceCovers(cover: SolidScriptFaceFacts, face: SolidScriptFaceFacts): boolean {
  if (cover.normal.dot(face.normal) > -1 + SOLID_SCRIPT_GEOMETRY_EPSILON) return false;
  const offset = new THREE.Vector3().subVectors(face.center, cover.center);
  if (Math.abs(offset.dot(cover.normal)) > SOLID_SCRIPT_GEOMETRY_EPSILON) return false;
  const edge = new THREE.Vector3();
  const toCenter = new THREE.Vector3();
  let sign = 0;
  for (let index = 0; index < cover.corners.length; index++) {
    const start = cover.corners[index]!;
    const end = cover.corners[(index + 1) % cover.corners.length]!;
    const side = edge.subVectors(end, start).cross(toCenter.subVectors(face.center, start)).dot(cover.normal);
    if (Math.abs(side) <= SOLID_SCRIPT_GEOMETRY_EPSILON) continue;
    if (sign !== 0 && Math.sign(side) !== sign) return false;
    sign = Math.sign(side);
  }
  return true;
}
