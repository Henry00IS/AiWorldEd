import * as THREE from 'three';
import { TransformMode } from '@/types/transform_mode.js';
import { TransformModalAxis, transformModalAxisIsLocked } from '@/transform/modal/transform_modal_axis.js';
import { transformModalAxisWorldVector } from '@/transform/modal/transform_modal_axis_vector.js';
import {
  transformModalNumericRotationRadians,
  transformModalNumericScaleFactor,
  transformModalNumericTranslationDelta,
} from '@/transform/modal/transform_modal_numeric_delta.js';
import { freeScaleAxisFactors } from '@/transform/core/free_scale_axis_factors.js';
import type { ComponentTransformVertex } from './component_transform_vertex.js';
import {
  applyComponentRotationDelta,
  applyComponentScaleDelta,
  applyComponentScaleDeltaInBasis,
  applyComponentTranslationDelta,
} from './component_transform_apply.js';

/**
 * Applies a typed modal numeric value to component transform vertices.
 *
 * @param mode Active transform mode.
 * @param vertices Component vertices (initialLocal is pre-drag snapshot).
 * @param pivot World pivot.
 * @param value Parsed typed value (distance, degrees, or scale factor).
 * @param axis Modal axis lock (or None for free scale / free rotate).
 * @param orientation Axis orientation quaternion.
 * @param camera Drag camera for free rotate/scale.
 * @returns True when the value was applied.
 */
export function applyComponentModalNumericValue(
  mode: TransformMode,
  vertices: readonly ComponentTransformVertex[],
  pivot: THREE.Vector3,
  value: number,
  axis: TransformModalAxis,
  orientation: THREE.Quaternion,
  camera: THREE.Camera | null,
): boolean {
  if (vertices.length === 0) {
    return false;
  }
  if (mode === TransformMode.TRANSLATE) {
    return applyComponentModalTranslateNumeric(vertices, value, axis, orientation);
  }
  if (mode === TransformMode.ROTATE) {
    return applyComponentModalRotateNumeric(vertices, pivot, value, axis, orientation, camera);
  }
  if (mode === TransformMode.SCALE) {
    return applyComponentModalScaleNumeric(vertices, pivot, value, axis, orientation, camera);
  }
  return false;
}

/**
 * Applies typed translation distance along a locked axis.
 *
 * @param vertices Component vertices.
 * @param value Distance.
 * @param axis Locked axis.
 * @param orientation Orientation.
 * @returns True when applied.
 */
function applyComponentModalTranslateNumeric(
  vertices: readonly ComponentTransformVertex[],
  value: number,
  axis: TransformModalAxis,
  orientation: THREE.Quaternion,
): boolean {
  if (!transformModalAxisIsLocked(axis)) {
    return false;
  }
  const delta = transformModalNumericTranslationDelta(value, axis, orientation);
  if (!delta) {
    return false;
  }
  applyComponentTranslationDelta(vertices, delta);
  return true;
}

/**
 * Applies typed rotation in degrees about a locked axis or free view axis.
 *
 * @param vertices Component vertices.
 * @param pivot World pivot.
 * @param value Degrees.
 * @param axis Locked axis, or None for view free rotate.
 * @param orientation Orientation.
 * @param camera Camera for free rotate.
 * @returns True when applied.
 */
function applyComponentModalRotateNumeric(
  vertices: readonly ComponentTransformVertex[],
  pivot: THREE.Vector3,
  value: number,
  axis: TransformModalAxis,
  orientation: THREE.Quaternion,
  camera: THREE.Camera | null,
): boolean {
  const radians = transformModalNumericRotationRadians(value);
  const worldAxis = resolveComponentModalRotationAxis(axis, orientation, camera);
  if (!worldAxis) {
    return false;
  }
  applyComponentRotationDelta(vertices, pivot, worldAxis, radians);
  return true;
}

/**
 * Resolves a world rotation axis for modal numeric rotate.
 *
 * @param axis Modal axis.
 * @param orientation Orientation.
 * @param camera Camera for free view rotate.
 * @returns Unit world axis, or null.
 */
function resolveComponentModalRotationAxis(
  axis: TransformModalAxis,
  orientation: THREE.Quaternion,
  camera: THREE.Camera | null,
): THREE.Vector3 | null {
  if (transformModalAxisIsLocked(axis)) {
    return transformModalAxisWorldVector(axis, orientation);
  }
  if (!camera) {
    return null;
  }
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  return forward.normalize();
}

/**
 * Applies typed scale factor on a locked axis or free uniform scale.
 *
 * @param vertices Component vertices.
 * @param pivot World pivot.
 * @param value Scale factor.
 * @param axis Locked axis, or None for free scale.
 * @param orientation Orientation.
 * @param camera Camera for free scale planarity.
 * @returns True when applied.
 */
function applyComponentModalScaleNumeric(
  vertices: readonly ComponentTransformVertex[],
  pivot: THREE.Vector3,
  value: number,
  axis: TransformModalAxis,
  orientation: THREE.Quaternion,
  camera: THREE.Camera | null,
): boolean {
  const factor = transformModalNumericScaleFactor(value);
  if (transformModalAxisIsLocked(axis)) {
    const scaleFactors = componentModalLockedScaleFactors(factor, axis);
    applyComponentScaleDeltaInBasis(vertices, pivot, scaleFactors, orientation);
    return true;
  }
  const freeFactors = freeScaleAxisFactors(factor, camera, true);
  applyComponentScaleDelta(vertices, pivot, freeFactors);
  return true;
}

/**
 * Builds per-axis scale factors for a locked modal axis.
 *
 * @param factor Scale factor applied to the locked axis.
 * @param axis Locked axis.
 * @returns Factors with the locked axis set to the factor and the others set to
 *   1.
 */
export function componentModalLockedScaleFactors(factor: number, axis: TransformModalAxis): THREE.Vector3 {
  if (axis === TransformModalAxis.X) {
    return new THREE.Vector3(factor, 1, 1);
  }
  if (axis === TransformModalAxis.Y) {
    return new THREE.Vector3(1, factor, 1);
  }
  return new THREE.Vector3(1, 1, factor);
}
