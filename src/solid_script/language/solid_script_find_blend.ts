import * as THREE from 'three';
import type { SolidScriptFaceFacts } from './solid_script_geometry.js';
import { solidScriptMemberRound } from './solid_script_members.js';
import { solidScriptValueNumber, solidScriptValueNumbers, type SolidScriptValue } from './solid_script_value.js';

/**
 * How a find block reads Sample: once on the face found, or at its corners
 * blended.
 */
export const SOLID_SCRIPT_FIND_BLENDS = ['Face', 'Corners'] as const;

/**
 * Gives how much each corner of a face counts at a point on it: the face is
 * fanned into triangles from its first corner, the triangle nearest the point
 * is picked, and the point's barycentric share of its three corners is used.
 *
 * @param face Face.
 * @param point Point on or near the face.
 * @returns One weight per corner, adding up to 1.
 */
export function solidScriptFindCornerWeights(face: SolidScriptFaceFacts, point: THREE.Vector3): number[] {
  const weights = face.corners.map(() => 0);
  let best = Infinity;
  for (let corner = 1; corner + 1 < face.corners.length; corner++) {
    const triangle = new THREE.Triangle(face.corners[0], face.corners[corner], face.corners[corner + 1]);
    const near = triangle.closestPointToPoint(point, new THREE.Vector3());
    if (near.distanceToSquared(point) >= best - 1e-12) continue;
    best = near.distanceToSquared(point);
    const share = triangle.getBarycoord(near, new THREE.Vector3()) ?? new THREE.Vector3(1, 0, 0);
    weights.fill(0);
    weights[0] = share.x;
    weights[corner] = share.y;
    weights[corner + 1] = share.z;
  }
  return weights;
}

/**
 * Mixes the values read at a face's corners by their weights, as numbers or as
 * vectors of the same length.
 *
 * @param values One value per corner.
 * @param weights One weight per corner.
 * @returns Mixed number or vector.
 */
export function solidScriptFindBlendValues(
  values: readonly SolidScriptValue[],
  weights: readonly number[],
): SolidScriptValue {
  const lists = values.map((value) =>
    Array.isArray(value) ? solidScriptValueNumbers(value) : [solidScriptValueNumber(value)],
  );
  const size = lists[0]?.length ?? 0;
  if (lists.some((list) => !list || list.length !== size || list.some((part) => part === undefined)))
    throw new Error('Blend Corners needs Sample to give a number or a vector at every corner');
  const mixed = Array.from({ length: size }, (_, axis) =>
    solidScriptMemberRound(lists.reduce((sum, list, index) => sum + (weights[index] ?? 0) * (list?.[axis] ?? 0), 0)),
  );
  return Array.isArray(values[0]) ? mixed : (mixed[0] ?? 0);
}
