import * as THREE from 'three';
import { TransformModalAxis } from './transform_modal_axis.js';
import { TransformProjectionMath } from '@/transform/core/transform_projection_math.js';
import { transformModalAxisToGizmoAxis } from './transform_modal_effective_axis.js';

/**
 * Builds a unit world-space direction for a modal axis lock.
 *
 * @param axis Modal axis lock (must not be None).
 * @param orientation Quaternion that maps the local axis into world space.
 * @returns Unit world direction, or null when axis is None.
 */
export function transformModalAxisWorldVector(
  axis: TransformModalAxis,
  orientation: THREE.Quaternion,
): THREE.Vector3 | null {
  const gizmoAxis = transformModalAxisToGizmoAxis(axis);
  if (!gizmoAxis) {
    return null;
  }
  return TransformProjectionMath.axisToWorldVector(gizmoAxis, orientation);
}

/**
 * Returns theme-friendly RGB for a modal axis lock.
 *
 * @param axis Modal axis lock.
 * @returns Hex color matching gizmo axes, or white when unlocked.
 */
export function transformModalAxisColorHex(axis: TransformModalAxis): number {
  if (axis === TransformModalAxis.X) return 0xff3333;
  if (axis === TransformModalAxis.Y) return 0x33ff33;
  if (axis === TransformModalAxis.Z) return 0x3333ff;
  return 0xffffff;
}
