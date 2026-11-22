import * as THREE from 'three';
import type { SolidScriptFindHit } from './solid_script_find.js';
import type { SolidScriptFaceFacts } from './solid_script_geometry.js';
import { solidScriptFaceCornerUvs } from './solid_script_uvs.js';

/**
 * How far outside a triangle, in UV units, a point may lie and still count as
 * inside.
 */
const SOLID_SCRIPT_FIND_UV_SLACK = 1e-9;

/**
 * Weighs the three corners of a UV triangle so they add up to a UV point.
 *
 * @param uv UV point.
 * @param a First corner.
 * @param b Second corner.
 * @param c Third corner.
 * @returns The three weights, or none for a triangle of no area.
 */
function solidScriptFindUvWeights(
  uv: readonly [number, number],
  a: readonly [number, number],
  b: readonly [number, number],
  c: readonly [number, number],
): [number, number, number] | undefined {
  const area = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
  if (Math.abs(area) < 1e-15) return undefined;
  const wb = ((uv[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (uv[1] - a[1])) / area;
  const wc = ((b[0] - a[0]) * (uv[1] - a[1]) - (uv[0] - a[0]) * (b[1] - a[1])) / area;
  return [1 - wb - wc, wb, wc];
}

/**
 * Finds where a UV point lies on one face, by splitting the face into a fan of
 * triangles from its first corner.
 *
 * @param uv UV point.
 * @param face Face.
 * @returns The point on the face, or none when the UV lies outside it.
 */
function solidScriptFindUvOnFace(uv: readonly [number, number], face: SolidScriptFaceFacts): THREE.Vector3 | undefined {
  const uvs = solidScriptFaceCornerUvs(face);
  for (let corner = 1; corner + 1 < uvs.length; corner++) {
    const picked = [0, corner, corner + 1];
    const [a, b, c] = picked.map((index) => uvs[index] ?? ([0, 0] as [number, number]));
    const weights = a && b && c ? solidScriptFindUvWeights(uv, a, b, c) : undefined;
    if (!weights || weights.some((weight) => weight < -SOLID_SCRIPT_FIND_UV_SLACK)) continue;
    return picked.reduce(
      (sum, index, at) => sum.addScaledVector(face.corners[index] ?? new THREE.Vector3(), weights[at] ?? 0),
      new THREE.Vector3(),
    );
  }
  return undefined;
}

/**
 * Finds the first face whose texture coordinates hold a UV point, and the point
 * on that face, blended from its corners.
 *
 * @param from UV point as U, V and a third number that is not used.
 * @param faces Faces to search, in order.
 * @returns The hit, at distance 0, or a miss.
 */
export function solidScriptFindAtUv(from: THREE.Vector3, faces: readonly SolidScriptFaceFacts[]): SolidScriptFindHit {
  const uv: [number, number] = [from.x, from.y];
  for (const face of faces) {
    const position = solidScriptFindUvOnFace(uv, face);
    if (position) return { hit: true, position, distance: 0, normal: face.normal.clone(), face };
  }
  return { hit: false };
}
