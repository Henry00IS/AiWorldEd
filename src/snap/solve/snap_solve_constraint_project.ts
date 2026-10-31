import * as THREE from 'three';
import { GizmoAxis } from '@/types/transform_mode.js';
import { TransformModalAxis } from '@/transform/modal/transform_modal_axis.js';
import { transformModalConstrainTranslationDelta } from '@/transform/modal/transform_modal_delta_constrain.js';
import { snapSolveTranslateDelta } from './snap_solve_translate.js';

/**
 * Projects the source-to-target delta onto the active move constraint.
 *
 * @param sourcePoint Locked source point at drag start.
 * @param targetPoint Geometry hit point.
 * @param modalAxis Keyboard axis lock.
 * @param handleAxis Active gizmo handle, or null for a free move.
 * @param handleOrientation Gizmo orientation.
 * @param keyboardOrientation Orientation used by the keyboard axis lock.
 * @returns Constrained world delta. Free moves keep the full delta.
 */
export function snapSolveConstrainedTranslation(
  sourcePoint: THREE.Vector3,
  targetPoint: THREE.Vector3,
  modalAxis: TransformModalAxis,
  handleAxis: GizmoAxis | null,
  handleOrientation: THREE.Quaternion,
  keyboardOrientation: THREE.Quaternion,
): THREE.Vector3 {
  const fullDelta = snapSolveTranslateDelta(sourcePoint, targetPoint);
  return transformModalConstrainTranslationDelta(
    fullDelta,
    modalAxis,
    handleAxis,
    handleOrientation,
    keyboardOrientation,
  );
}
