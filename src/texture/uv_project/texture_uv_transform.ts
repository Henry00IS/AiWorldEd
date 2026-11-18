import * as THREE from 'three';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';

/** Offset, scale and rotate applied in UV space. */
export interface TextureUvTransform {
  /** Added to U after scale and rotate. */
  offsetU: number;
  /** Added to V after scale and rotate. */
  offsetV: number;
  /** Multiplier of U. */
  scaleU: number;
  /** Multiplier of V. */
  scaleV: number;
  /** Rotation around the pivot, in degrees. */
  rotationDeg: number;
  /** U of the rotation and scale pivot. */
  pivotU: number;
  /** V of the rotation and scale pivot. */
  pivotV: number;
}

/**
 * Applies an offset, scale and rotate in UV space to a matrix.
 *
 * @param matrix Existing UV matrix.
 * @param transform Offset, scale, rotate and pivot.
 * @returns Transformed matrix.
 */
export function textureUvTransformMatrix(matrix: SurfaceUvMatrix, transform: TextureUvTransform): SurfaceUvMatrix {
  const [a, b, c, d, e, f] = textureUvTransformAffine(transform);
  return new SurfaceUvMatrix(textureUvTransformRow(matrix, a, b, c), textureUvTransformRow(matrix, d, e, f));
}

/**
 * Applies an offset, scale and rotate in UV space to one corner coordinate.
 *
 * @param uv Existing U and V.
 * @param transform Offset, scale, rotate and pivot.
 * @returns Transformed U and V.
 */
export function textureUvTransformPoint(
  uv: readonly [number, number],
  transform: TextureUvTransform,
): [number, number] {
  const [a, b, c, d, e, f] = textureUvTransformAffine(transform);
  return [a * uv[0] + b * uv[1] + c, d * uv[0] + e * uv[1] + f];
}

/**
 * Builds the 2D affine map of a UV transform: u' = a u + b v + c, v' = d u + e
 * v + f, with rotate and scale about the pivot, then offset.
 *
 * @param transform Offset, scale, rotate and pivot.
 * @returns Coefficients a, b, c, d, e, f.
 */
export function textureUvTransformAffine(
  transform: TextureUvTransform,
): [number, number, number, number, number, number] {
  const angle = (transform.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const a = transform.scaleU * cos;
  const b = -transform.scaleU * sin;
  const d = transform.scaleV * sin;
  const e = transform.scaleV * cos;
  const c = transform.offsetU + transform.pivotU - a * transform.pivotU - b * transform.pivotV;
  const f = transform.offsetV + transform.pivotV - d * transform.pivotU - e * transform.pivotV;
  return [a, b, c, d, e, f];
}

/**
 * Combines two rows of a UV matrix as p * a + q * b + shift.
 *
 * @param matrix Source matrix.
 * @param alongU Weight of the U row.
 * @param alongV Weight of the V row.
 * @param shift Added constant.
 * @returns Combined row.
 */
function textureUvTransformRow(matrix: SurfaceUvMatrix, alongU: number, alongV: number, shift: number): THREE.Vector4 {
  return new THREE.Vector4(
    matrix.u.x * alongU + matrix.v.x * alongV,
    matrix.u.y * alongU + matrix.v.y * alongV,
    matrix.u.z * alongU + matrix.v.z * alongV,
    matrix.u.w * alongU + matrix.v.w * alongV + shift,
  );
}
