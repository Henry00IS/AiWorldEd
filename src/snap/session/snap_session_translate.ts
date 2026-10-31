import * as THREE from 'three';
import type { GizmoAxis } from '@/types/transform_mode.js';
import type { SnapHit } from '@/snap/hit/snap_hit.js';
import { snapSolveConstrainedTranslation } from '@/snap/solve/snap_solve_constraint_project.js';
import type { TransformModalAxis } from '@/transform/modal/transform_modal_axis.js';

/**
 * World delta that lands the locked source on a geometry hit, projected onto
 * the active move constraint. Returns null when there is no hit, so the caller
 * keeps increment snap.
 *
 * @param sourcePoint Locked source point at drag start, or null.
 * @param hit Winning geometry hit, or null.
 * @param modalAxis Keyboard axis lock.
 * @param handleAxis Active gizmo handle, or null for a free move.
 * @param handleOrientation Gizmo orientation.
 * @param keyboardOrientation Orientation used by the keyboard axis lock.
 * @returns Constrained world delta, or null when geometry snap does not apply.
 */
export function resolveGeometryTranslationDelta(
  sourcePoint: THREE.Vector3 | null,
  hit: SnapHit | null,
  modalAxis: TransformModalAxis,
  handleAxis: GizmoAxis | null,
  handleOrientation: THREE.Quaternion,
  keyboardOrientation: THREE.Quaternion,
): THREE.Vector3 | null {
  if (!sourcePoint || !hit) {
    return null;
  }
  return snapSolveConstrainedTranslation(
    sourcePoint,
    hit.point,
    modalAxis,
    handleAxis,
    handleOrientation,
    keyboardOrientation,
  );
}
