import * as THREE from 'three';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';

/**
 * Measures radial distance from a pivot to a world point projected on a plane.
 *
 * @param worldPoint Sample point.
 * @param worldPivot Pivot on the plane.
 * @param planeNormal Unit plane normal.
 * @returns In-plane distance.
 */
export function measureInPlaneRadius(
  worldPoint: THREE.Vector3,
  worldPivot: THREE.Vector3,
  planeNormal: THREE.Vector3,
): number {
  const offset = worldPoint.clone().sub(worldPivot);
  const normal = planeNormal.clone().normalize();
  offset.addScaledVector(normal, -offset.dot(normal));
  return offset.length();
}

/**
 * Computes a uniform scale factor from start and current radii.
 *
 * @param startRadius Radius at drag begin.
 * @param currentRadius Radius at current sample.
 * @returns Scale factor, or 1 when start radius is degenerate.
 */
export function computeUniformScaleFactor(startRadius: number, currentRadius: number): number {
  if (!Number.isFinite(startRadius) || startRadius < 1e-6) {
    return 1;
  }
  if (!Number.isFinite(currentRadius)) {
    return 1;
  }
  return Math.max(1e-4, currentRadius / startRadius);
}

/**
 * Applies a uniform UV scale about a world pivot so the texture tracks radial
 * mouse motion. Positions are scaled by 1/factor about the pivot before
 * projection.
 *
 * @param baseline UV matrix before scale.
 * @param worldPivot Scale pivot.
 * @param factor Cursor scale factor (greater than 1 enlarges the texture).
 * @returns Updated UV matrix.
 */
export function applyUvScaleToMatrix(
  baseline: SurfaceUvMatrix,
  worldPivot: THREE.Vector3,
  factor: number,
): SurfaceUvMatrix {
  const safeFactor = !Number.isFinite(factor) || Math.abs(factor) < 1e-4 ? 1 : factor;
  const inverse = 1 / safeFactor;
  const matrix = buildPivotScaleMatrix(worldPivot, inverse);
  return baseline.multiplyMatrix4(matrix);
}

/**
 * Builds T(pivot) * Scale(s) * T(-pivot) with uniform XYZ scale.
 *
 * @param worldPivot Scale pivot.
 * @param scaleFactor Uniform scale.
 * @returns Composite transform.
 */
function buildPivotScaleMatrix(worldPivot: THREE.Vector3, scaleFactor: number): THREE.Matrix4 {
  const scale = new THREE.Matrix4().makeScale(scaleFactor, scaleFactor, scaleFactor);
  const toOrigin = new THREE.Matrix4().makeTranslation(-worldPivot.x, -worldPivot.y, -worldPivot.z);
  const fromOrigin = new THREE.Matrix4().makeTranslation(worldPivot.x, worldPivot.y, worldPivot.z);
  return fromOrigin.multiply(scale).multiply(toOrigin);
}
