import * as THREE from 'three';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';
import { textureUvProjectPlanar } from './texture_uv_project_planar.js';
import { textureUvProjectPoint } from './texture_uv_project_view.js';

/**
 * Unwraps a face onto its own plane, using the editor's planar basis, then
 * shifts the island so its lowest U and V are 0.
 *
 * @param corners Face corners in order.
 * @param normal Unit face normal.
 * @param size Metres covered by one texture repeat.
 * @returns Matrix in the corners' space, or null when the face has no corners.
 */
export function textureUvUnwrapFace(
  corners: readonly THREE.Vector3[],
  normal: THREE.Vector3,
  size: number,
): SurfaceUvMatrix | null {
  const origin = corners[0];
  if (!origin) return null;
  const mapped = textureUvProjectPlanar(normal, size, origin);
  const lowest = textureUvUnwrapLowest(corners, mapped);
  return textureUvUnwrapShift(mapped, -lowest[0], -lowest[1]);
}

/**
 * Finds the lowest U and V of corners under a matrix.
 *
 * @param corners Face corners.
 * @param matrix UV matrix.
 * @returns Lowest U and V.
 */
function textureUvUnwrapLowest(corners: readonly THREE.Vector3[], matrix: SurfaceUvMatrix): [number, number] {
  let lowestU = Infinity;
  let lowestV = Infinity;
  for (const corner of corners) {
    const [u, v] = textureUvProjectPoint(matrix, corner);
    if (u < lowestU) lowestU = u;
    if (v < lowestV) lowestV = v;
  }
  return [lowestU, lowestV];
}

/**
 * Shifts a UV matrix by constants in U and V.
 *
 * @param matrix Source matrix.
 * @param offsetU Added to U.
 * @param offsetV Added to V.
 * @returns Shifted matrix.
 */
function textureUvUnwrapShift(matrix: SurfaceUvMatrix, offsetU: number, offsetV: number): SurfaceUvMatrix {
  return new SurfaceUvMatrix(
    new THREE.Vector4(matrix.u.x, matrix.u.y, matrix.u.z, matrix.u.w + offsetU),
    new THREE.Vector4(matrix.v.x, matrix.v.y, matrix.v.z, matrix.v.w + offsetV),
  );
}
