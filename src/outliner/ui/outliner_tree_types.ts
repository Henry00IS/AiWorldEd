import type * as THREE from 'three';
import type { OutlinerDropPlacement } from './outliner_drop_placement.js';

/**
 * Callback type for tree-level selection events.
 *
 * @param obj The Three.js object that was selected.
 * @param event The mouse event that triggered selection (for modifiers).
 */
export type TreeSelectCallback = (obj: THREE.Object3D, event?: MouseEvent) => void;

/**
 * Callback type for hierarchy reparent drop events.
 *
 * @param dragged The object being dragged.
 * @param dropTarget The object that received the drop.
 * @param placement Vertical drop placement relative to the target row.
 */
export type TreeReparentCallback = (
  dragged: THREE.Object3D,
  dropTarget: THREE.Object3D,
  placement: OutlinerDropPlacement,
) => void;

/**
 * Callback type for tree-level visibility toggle events.
 *
 * @param obj The Three.js object whose visibility toggled.
 */
export type TreeVisibilityCallback = (obj: THREE.Object3D) => void;

/**
 * Callback type for tree-level lock toggle events.
 *
 * @param obj The Three.js object whose lock state toggled.
 */
export type TreeLockCallback = (obj: THREE.Object3D) => void;

/**
 * Callback type for tree-level rename events.
 *
 * @param obj The Three.js object being renamed.
 * @param newName The new name entered by the user.
 */
export type TreeRenameCallback = (obj: THREE.Object3D, newName: string) => void;

/**
 * Callback type for tree-level context menu requests.
 *
 * @param obj The Three.js object for the context menu.
 * @param x The horizontal screen coordinate.
 * @param y The vertical screen coordinate.
 */
export type TreeContextMenuCallback = (obj: THREE.Object3D, x: number, y: number) => void;

/**
 * Callback type for a Shift-drag or Ctrl/Meta-drag paint over outliner rows.
 *
 * @param painted Rows from the pressed row to the row under the pointer, in
 *   tree order.
 * @param isFirstStep True for the first update of a paint gesture.
 * @param subtractive True when the gesture removes rows (Ctrl/Meta).
 */
export type TreePaintSelectCallback = (
  painted: readonly THREE.Object3D[],
  isFirstStep: boolean,
  subtractive: boolean,
) => void;
