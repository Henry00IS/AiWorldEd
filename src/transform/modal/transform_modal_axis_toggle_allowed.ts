import { GizmoAxis, TransformMode } from '@/types/transform_mode.js';

/**
 * Returns whether X/Y/Z keyboard axis constraints may be toggled. Shape
 * Editor-style free grab (single-use) always allows them. Permanent translate,
 * scale, and rotate widgets only allow them while dragging the free VIEW
 * control (center cube / free-scale ring / free-rotate sphere); axis handles
 * already lock motion to their axis.
 *
 * @param mode Active transform mode.
 * @param activeHandleAxis Handle picked for this drag, or null.
 * @param isSingleUseDrag True during G/R/S single-use.
 * @returns True when X/Y/Z toggles should apply.
 */
export function transformModalAxisToggleAllowed(
  mode: TransformMode,
  activeHandleAxis: GizmoAxis | null,
  isSingleUseDrag: boolean,
): boolean {
  if (isSingleUseDrag) {
    return true;
  }
  if (mode === TransformMode.TRANSLATE || mode === TransformMode.SCALE || mode === TransformMode.ROTATE) {
    return activeHandleAxis === GizmoAxis.VIEW;
  }
  return true;
}
