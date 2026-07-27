import * as THREE from 'three';

/**
 * UserData flag: whether this viewport gizmo clone should be drawn/pickable
 * when the transform tool is active. Separate from Object3D.visible so
 * multi-view can hide sibling pane clones during each scissor pass without
 * disabling picks.
 */
export const GIZMO_WANTED_VISIBLE_KEY = 'gizmoWantedVisible';

/**
 * Records whether a viewport gizmo clone is enabled for the current tool state.
 * Leaves Object3D.visible false so only prepareRender for that pane shows it.
 *
 * @param group Viewport gizmo clone.
 * @param wanted Whether the tool wants the gizmo shown when this pane renders.
 */
export function setGizmoWantedVisible(group: THREE.Object3D, wanted: boolean): void {
  group.userData[GIZMO_WANTED_VISIBLE_KEY] = wanted;
  group.visible = false;
}

/**
 * Returns whether the gizmo is enabled for the active tool (wanted), falling
 * back to Object3D.visible for tests that only set visible.
 *
 * @param group Viewport gizmo clone.
 * @returns True when picks and multi-view prepare should treat it as active.
 */
export function isGizmoWantedVisible(group: THREE.Object3D): boolean {
  const wanted = group.userData[GIZMO_WANTED_VISIBLE_KEY];
  if (wanted === true) return true;
  if (wanted === false) return false;
  return group.visible === true;
}

/**
 * Shows a pane's gizmo clone for one multi-view scissor pass when the tool
 * wants it enabled.
 *
 * @param group Viewport gizmo clone, or null.
 */
export function showGizmoForRenderPass(group: THREE.Object3D | null): void {
  if (!group) return;
  group.visible = isGizmoWantedVisible(group);
}

/**
 * Hides a pane's gizmo clone after its multi-view scissor pass so sibling panes
 * do not draw foreign grips.
 *
 * @param group Viewport gizmo clone, or null.
 */
export function hideGizmoAfterRenderPass(group: THREE.Object3D | null): void {
  if (!group) return;
  group.visible = false;
}
