import * as THREE from 'three';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { GizmoTransform } from '@/transform/gizmo/gizmo_transform.js';
import { TransformExecutor } from '@/transform/core/transform_executor.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { TransformSpace } from '@/types/transform_space.js';
import type { Toolbar } from '@/ui/toolbar/toolbar.js';

/** Dependencies for gizmo pivot and orientation updates. */
export interface ContextHelpersLayoutGizmo {
  selectionManager: ManagerSelection;
  transformGizmo: GizmoTransform;
  transformExecutor: TransformExecutor;
  transformSpace: TransformSpace;
  /** Workspace grid rotation used while Global space is active. */
  gridSnap: GridSnap;
  /**
   * Optional camera for master-group scale and bounds sizing only. Per-pane
   * clone scale is applied in the render loop via
   * {@link GizmoTransform.prepareTransformCloneForCamera}.
   */
  getGizmoScaleCamera: () => THREE.Camera | null;
  toolbar: Toolbar;
  showStatusMessage: (message: string) => void;
  /**
   * Optional Edit Mode component pivot. When present and non-null, overrides
   * the object-selection pivot while keeping orientation from selection.
   *
   * @returns Component world pivot, or null when not in component edit.
   */
  resolveEditModeComponentPivot?: () => THREE.Vector3 | null;
}

/**
 * Updates the gizmo pivot to the selection center and refreshes orientation.
 *
 * @param context Gizmo subsystem dependencies.
 */
export function updateLayoutGizmoPivot(context: ContextHelpersLayoutGizmo): void {
  const componentPivot = context.resolveEditModeComponentPivot?.() ?? null;
  if (componentPivot) {
    applyComponentEditGizmoPose(context, componentPivot);
    return;
  }
  const selected = Array.from(context.selectionManager.getSelectedObjects());
  if (selected.length > 0) {
    applySelectionGizmoPose(context, selected);
    return;
  }
  context.transformGizmo.setPivot(new THREE.Vector3(0, 0, 0));
  context.transformGizmo.setOrientation(resolveLayoutGizmoOrientation(context, []));
  context.transformGizmo.updateBoundsFromMeshes([]);
}

/**
 * Places the gizmo at a component selection pivot while Edit Mode is active.
 *
 * @param context Gizmo subsystem dependencies.
 * @param pivot Component world pivot.
 */
function applyComponentEditGizmoPose(context: ContextHelpersLayoutGizmo, pivot: THREE.Vector3): void {
  const selected = Array.from(context.selectionManager.getSelectedObjects());
  context.transformGizmo.setPivot(pivot);
  context.transformGizmo.setOrientation(resolveLayoutGizmoOrientation(context, selected));
  syncGizmoOrthoDepthAxisPolicy(context);
  const camera = context.getGizmoScaleCamera();
  if (camera) {
    context.transformGizmo.updateScaleForCamera(camera);
  }
  context.transformGizmo.updateBoundsFromMeshes(selected, camera);
}

/**
 * Applies pivot, orientation, camera scale, and bounds size for a non-empty
 * selection.
 *
 * @param context Gizmo subsystem dependencies.
 * @param selected Currently selected meshes.
 */
function applySelectionGizmoPose(context: ContextHelpersLayoutGizmo, selected: THREE.Mesh[]): void {
  const pivot = context.transformExecutor.computePivot(selected);
  context.transformGizmo.setPivot(pivot);
  context.transformGizmo.setOrientation(resolveLayoutGizmoOrientation(context, selected));
  syncGizmoOrthoDepthAxisPolicy(context);
  const camera = context.getGizmoScaleCamera();
  if (camera) {
    context.transformGizmo.updateScaleForCamera(camera);
    context.transformGizmo.updateBoundsFromMeshes(selected, camera);
    return;
  }
  context.transformGizmo.updateBoundsFromMeshes(selected);
}

/**
 * Hides Global-space depth axes in 2D panes; Local space keeps every axis.
 *
 * @param context Gizmo subsystem dependencies.
 */
function syncGizmoOrthoDepthAxisPolicy(context: ContextHelpersLayoutGizmo): void {
  const hideDepthAxes = context.transformSpace !== TransformSpace.Local;
  context.transformGizmo.setHideOrthoDepthAxes(hideDepthAxes);
}

/**
 * Resolves the world quaternion for translate, rotate, and scale handles.
 *
 * @param context Active transform space and workspace grid snap.
 * @param selected Currently selected objects.
 * @returns World-space quaternion for the gizmo handles.
 */
export function resolveLayoutGizmoOrientation(
  context: Pick<ContextHelpersLayoutGizmo, 'transformSpace' | 'gridSnap'>,
  selected: THREE.Object3D[],
): THREE.Quaternion {
  if (usesSingleObjectLocalOrientation(context.transformSpace, selected)) {
    return copySingleObjectWorldQuaternion(selected);
  }
  if (context.transformSpace === TransformSpace.Local) {
    return new THREE.Quaternion();
  }
  return context.gridSnap.copyWorkspaceBasisQuaternionTo(new THREE.Quaternion());
}

/**
 * Returns whether Local space has exactly one selected object.
 *
 * @param transformSpace Active transform space.
 * @param selected Currently selected objects.
 * @returns True when the single object supplies handle orientation.
 */
function usesSingleObjectLocalOrientation(transformSpace: TransformSpace, selected: THREE.Object3D[]): boolean {
  return transformSpace === TransformSpace.Local && selected.length === 1;
}

/**
 * Copies the world quaternion of the only selected object.
 *
 * @param selected Selection that contains one object.
 * @returns World-space quaternion of that object, or identity when missing.
 */
function copySingleObjectWorldQuaternion(selected: THREE.Object3D[]): THREE.Quaternion {
  const orientation = new THREE.Quaternion();
  const target = selected[0];
  if (!target) {
    return orientation;
  }
  target.updateMatrixWorld(true);
  target.getWorldQuaternion(orientation);
  return orientation;
}

/**
 * Applies a transform space mode, updates toolbar, and refreshes gizmos.
 *
 * @param context Gizmo subsystem dependencies.
 * @param space Global or Local.
 * @param setTransformSpace Stores the active transform space on the layout.
 */
export function applyLayoutTransformSpace(
  context: ContextHelpersLayoutGizmo,
  space: TransformSpace,
  setTransformSpace: (space: TransformSpace) => void,
): void {
  setTransformSpace(space);
  const isLocal = space === TransformSpace.Local;
  context.toolbar.setButtonActiveByLabel('Global', !isLocal);
  context.toolbar.setButtonActiveByLabel('Local', isLocal);
  const nextContext = { ...context, transformSpace: space };
  syncGizmoOrthoDepthAxisPolicy(nextContext);
  updateLayoutGizmoPivot(nextContext);
  context.showStatusMessage(isLocal ? 'Gizmo space: Local' : 'Gizmo space: Global');
}

/**
 * Intentionally does not stamp a shared scale onto every viewport clone.
 * Multi-view sizing is per pane in the render loop
 * ({@link GizmoTransform.prepareTransformCloneForCamera}); a global pass would
 * let the 3D fly camera inflate Top/Front/Side handles.
 *
 * @param _context Gizmo subsystem dependencies (unused).
 */
export function updateLayoutGizmoCameraScale(_context: ContextHelpersLayoutGizmo): void {}
