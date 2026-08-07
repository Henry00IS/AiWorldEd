import * as THREE from 'three';
import { BoundsFace } from '@/types/bounds_face.js';
import {
  computeOneSidedMeshResize,
  computeOneSidedMultiMeshResize,
  MIN_BOUNDS_HALF_EXTENT_FREE,
} from '@/transform/bounds/bounds_resize_math.js';
import type { DataOrientedBounds } from '@/transform/bounds/builder_oriented_bounds.js';
import { TransformModalAxis } from './transform_modal_axis.js';
import { transformModalAxisWorldVector } from './transform_modal_axis_vector.js';

/**
 * Applies a typed distance as bounds face move (translation) along a modal
 * axis.
 *
 * @param objects Drag targets.
 * @param initialPositions Pre-drag positions.
 * @param value Typed distance.
 * @param axis Effective single axis.
 * @param orientation Gizmo orientation.
 * @param outDelta Optional vector to receive the applied world delta.
 * @returns True when applied.
 */
export function transformModalApplyBoundsMoveNumeric(
  objects: THREE.Object3D[],
  initialPositions: Map<THREE.Object3D, THREE.Vector3>,
  value: number,
  axis: TransformModalAxis,
  orientation: THREE.Quaternion,
  outDelta?: THREE.Vector3,
): boolean {
  const worldAxis = transformModalAxisWorldVector(axis, orientation);
  if (!worldAxis) {
    return false;
  }
  const delta = worldAxis.multiplyScalar(value);
  objects.forEach((object) => {
    const start = initialPositions.get(object);
    if (!start) return;
    object.position.copy(start).add(delta);
  });
  outDelta?.copy(delta);
  return true;
}

/**
 * Applies a typed distance as one-sided bounds resize along the active face.
 *
 * @param objects Drag targets.
 * @param initialPositions Pre-drag positions.
 * @param initialScales Pre-drag scales.
 * @param startBounds Bounds at drag start.
 * @param face Active bounds face.
 * @param value Typed displacement along the face outward normal.
 * @param minHalfExtent Minimum half-extent after resize.
 * @returns True when applied.
 */
export function transformModalApplyBoundsResizeNumeric(
  objects: THREE.Object3D[],
  initialPositions: Map<THREE.Object3D, THREE.Vector3>,
  initialScales: Map<THREE.Object3D, THREE.Vector3>,
  startBounds: DataOrientedBounds,
  face: BoundsFace,
  value: number,
  minHalfExtent: number = MIN_BOUNDS_HALF_EXTENT_FREE,
): boolean {
  const multi = objects.length > 1;
  objects.forEach((object) => {
    const startPos = initialPositions.get(object);
    const startScale = initialScales.get(object);
    if (!startPos || !startScale) return;
    const result = multi
      ? computeOneSidedMultiMeshResize(startPos, startScale, startBounds, face, value, minHalfExtent)
      : computeOneSidedMeshResize(startPos, startScale, startBounds, face, value, minHalfExtent);
    object.position.copy(result.position);
    object.scale.copy(result.scale);
  });
  return true;
}
