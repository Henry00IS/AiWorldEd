import * as THREE from 'three';
import type { SolidScriptFaceFacts } from './solid_script_geometry.js';

/** A tetrahedron used to fill a brush, with its volume as weight. */
export interface SolidScriptScatterPiece {
  corners: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3];
  weight: number;
}

/**
 * Groups Inside targets by the brush or mesh they belong to.
 *
 * @param faces Faces.
 * @returns Faces of each shape.
 */
export function solidScriptScatterGroups(faces: readonly SolidScriptFaceFacts[]): SolidScriptFaceFacts[][] {
  const groups = new Map<object, SolidScriptFaceFacts[]>();
  for (const face of faces) {
    const known = groups.get(face.leaf) ?? [];
    known.push(face);
    groups.set(face.leaf, known);
  }
  return [...groups.values()];
}

/**
 * Fills a solid with tetrahedra from its middle to each face triangle.
 *
 * @param faces Faces of one solid.
 * @returns Pieces.
 */
export function solidScriptScatterPieces(faces: readonly SolidScriptFaceFacts[]): SolidScriptScatterPiece[] {
  const origin = solidScriptScatterCenter(faces);
  const pieces: SolidScriptScatterPiece[] = [];
  for (const face of faces)
    for (let corner = 1; corner + 1 < face.corners.length; corner++) {
      const a = face.corners[0];
      const b = face.corners[corner];
      const c = face.corners[corner + 1];
      if (!a || !b || !c) continue;
      const weight = solidScriptScatterTetVolume(origin, a, b, c);
      if (weight > 1e-18) pieces.push({ corners: [origin, a, b, c], weight });
    }
  return pieces;
}

/**
 * Middle of the unique corners of some faces.
 *
 * @param faces Faces.
 * @returns Center.
 */
function solidScriptScatterCenter(faces: readonly SolidScriptFaceFacts[]): THREE.Vector3 {
  const seen: THREE.Vector3[] = [];
  for (const face of faces)
    for (const corner of face.corners)
      if (!seen.some((point) => point.distanceToSquared(corner) < 1e-16)) seen.push(corner);
  const center = new THREE.Vector3();
  for (const point of seen) center.add(point);
  return seen.length === 0 ? center : center.multiplyScalar(1 / seen.length);
}

/**
 * Volume of a tetrahedron.
 *
 * @param origin First corner.
 * @param a Second corner.
 * @param b Third corner.
 * @param c Fourth corner.
 * @returns Volume, never negative.
 */
function solidScriptScatterTetVolume(
  origin: THREE.Vector3,
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
): number {
  return (
    Math.abs(
      new THREE.Vector3()
        .subVectors(a, origin)
        .dot(new THREE.Vector3().subVectors(b, origin).cross(new THREE.Vector3().subVectors(c, origin))),
    ) / 6
  );
}

/**
 * Picks the piece whose running weight first reaches the target.
 *
 * @param pieces Weighted pieces.
 * @param target Value from 0 to the total weight.
 * @returns That piece's corners.
 */
export function solidScriptScatterWeighted(
  pieces: readonly SolidScriptScatterPiece[],
  target: number,
): [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3] {
  let reach = 0;
  let last = pieces[0];
  for (const piece of pieces) {
    reach += piece.weight;
    last = piece;
    if (reach >= target) return piece.corners;
  }
  if (!last) throw new Error('Inside needs an object with some volume in Of; a flat shape has no inside to scatter in');
  return last.corners;
}

/**
 * A uniform random point inside a tetrahedron.
 *
 * @param corners The four corners.
 * @param random Next unit random number.
 * @returns Point.
 */
export function solidScriptScatterTetPoint(
  corners: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3],
  random: () => number,
): THREE.Vector3 {
  const [first, second, third, fourth] = corners;
  const weights = [
    solidScriptScatterSpace(random()),
    solidScriptScatterSpace(random()),
    solidScriptScatterSpace(random()),
    solidScriptScatterSpace(random()),
  ] as const;
  const total = weights[0] + weights[1] + weights[2] + weights[3];
  return new THREE.Vector3()
    .addScaledVector(first, weights[0] / total)
    .addScaledVector(second, weights[1] / total)
    .addScaledVector(third, weights[2] / total)
    .addScaledVector(fourth, weights[3] / total);
}

/**
 * Turns a unit random number into a spacing used to pick uniformly in a
 * tetrahedron.
 *
 * @param unit Number from 0 to 1.
 * @returns Positive spacing.
 */
function solidScriptScatterSpace(unit: number): number {
  return -Math.log(Math.min(1 - 1e-12, Math.max(1e-12, unit)));
}
