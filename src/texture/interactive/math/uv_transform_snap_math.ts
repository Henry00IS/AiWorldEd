import * as THREE from 'three';
import {
  buildUvTransformPlaneBasis,
  composeWorldVectorFromPlaneBasis,
  projectWorldVectorOntoPlaneBasis,
} from './uv_transform_plane_basis.js';

/** Snap options for one UV transform sample. */
export interface UvTransformSnapOptions {
  /** When false, values pass through unchanged. */
  enabled: boolean;
  /** Translation snap interval in world meters. */
  translationInterval: number;
  /** Rotation snap step in degrees. */
  rotationSnapDegrees: number;
  /** Scale factor snap interval. */
  scaleSnapInterval: number;
}

/**
 * Snaps a world delta onto the plane lattice defined by the face normal.
 *
 * @param worldDelta Unsnapped world delta.
 * @param planeNormal Face plane normal.
 * @param options Snap options.
 * @returns Snapped world delta on the plane.
 */
export function snapUvMoveWorldDelta(
  worldDelta: THREE.Vector3,
  planeNormal: THREE.Vector3,
  options: UvTransformSnapOptions,
): THREE.Vector3 {
  if (!options.enabled || options.translationInterval <= 0) {
    return worldDelta.clone();
  }
  const basis = buildUvTransformPlaneBasis(planeNormal);
  const components = projectWorldVectorOntoPlaneBasis(worldDelta, basis);
  const snappedU = snapScalarToInterval(components.u, options.translationInterval);
  const snappedV = snapScalarToInterval(components.v, options.translationInterval);
  return composeWorldVectorFromPlaneBasis(snappedU, snappedV, basis);
}

/**
 * Snaps a rotation angle in degrees to the configured step.
 *
 * @param degrees Unsnapped rotation degrees.
 * @param options Snap options.
 * @returns Snapped degrees.
 */
export function snapUvRotationDegrees(degrees: number, options: UvTransformSnapOptions): number {
  if (!options.enabled || options.rotationSnapDegrees <= 0) {
    return degrees;
  }
  return snapScalarToInterval(degrees, options.rotationSnapDegrees);
}

/**
 * Snaps a uniform scale factor to the configured interval, clamped away from
 * zero.
 *
 * @param factor Unsnapped scale factor.
 * @param options Snap options.
 * @returns Snapped factor.
 */
export function snapUvScaleFactor(factor: number, options: UvTransformSnapOptions): number {
  const safe = Math.max(1e-4, Math.abs(factor)) * Math.sign(factor || 1);
  if (!options.enabled || options.scaleSnapInterval <= 0) {
    return safe;
  }
  const snapped = snapScalarToInterval(safe, options.scaleSnapInterval);
  return Math.max(1e-4, Math.abs(snapped)) * Math.sign(snapped || 1);
}

/**
 * Rounds a scalar to the nearest multiple of interval.
 *
 * @param value Input scalar.
 * @param interval Positive step size.
 * @returns Snapped scalar.
 */
function snapScalarToInterval(value: number, interval: number): number {
  return Math.round(value / interval) * interval;
}
