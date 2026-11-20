import * as THREE from 'three';
import { SurfaceUvMatrix } from './surface_uv_matrix.js';

/**
 * Adds UV-shift tiles to a mapping, and optionally flips U inside a face's own
 * chart so lettering stays readable after a reflection.
 *
 * @param uv Mapping before the copy pose is applied.
 * @param points Face corners in the same space as `uv`.
 * @param pose Copy-to-source matrix multiplied first, or none.
 * @param reverseU True flips U inside the face's chart.
 * @param shiftU Tiles added to U.
 * @param shiftV Tiles added to V.
 * @returns Mapping after the pose, the optional flip, and the shift.
 */
export function surfaceUvApplyPolicy(
  uv: SurfaceUvMatrix,
  points: readonly THREE.Vector3[],
  pose: THREE.Matrix4 | null,
  reverseU: boolean,
  shiftU: number,
  shiftV: number,
): SurfaceUvMatrix {
  const reflectionOffset = reverseU ? surfaceUvFaceUEnds(uv, points) : 0;
  const next = pose ? uv.multiplyMatrix4(pose) : uv.clone();
  if (reverseU) {
    next.u.multiplyScalar(-1);
    next.u.w += reflectionOffset;
  }
  next.u.w += shiftU;
  next.v.w += shiftV;
  return next;
}

/**
 * Sum of a face's smallest and largest U, used to flip U inside its chart.
 *
 * @param uv Mapping.
 * @param points Face corners in the same space as `uv`.
 * @returns Sum of the smallest and largest U.
 */
export function surfaceUvFaceUEnds(uv: SurfaceUvMatrix, points: readonly THREE.Vector3[]): number {
  if (points.length === 0) return 0;
  const values = points.map((point) => uv.project(point).u);
  return Math.min(...values) + Math.max(...values);
}
