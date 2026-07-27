import type * as THREE from 'three';
import { TransformMode } from '../../types/transform_mode.js';
import type { CadRulerSystem, CadRulerViewportBinding } from '../../rulers/cad_ruler_system.js';
import type { OrientedBoundsBuilder } from '../../transform/bounds/oriented_bounds.js';
import type { TransformHandler } from '../../transform/transform_handler.js';
import type { TransformGizmo } from '../../transform/gizmo/transform_gizmo.js';
import type { StatusBar } from '../../ui/status_bar.js';
import { filterUnlockedObjects } from '../../utils/object_lock.js';
import type { SelectionManager } from '../../selection/object/selection_manager.js';
import type { EditorViewport } from '../../viewports/editor_viewport.js';
import { getCadViewPlaneForKind } from '../../viewports/editor_viewport.js';

/** Host surface for CAD ruler selection and transform feedback. */
export interface LayoutCadRulerHost {
  cadRulerSystem: CadRulerSystem;
  rulerBoundsBuilder: OrientedBoundsBuilder;
  transformHandler: TransformHandler;
  transformGizmo: TransformGizmo;
  selectionManager: SelectionManager;
  statusBar: StatusBar | null;
}

/**
 * Builds CAD ruler viewport bindings for every interactive editor pane,
 * including detached multi-monitor viewports that share the same world scene.
 *
 * @param scene Shared world scene that receives ruler line batches.
 * @param viewports Main-window and detached live viewports.
 * @returns Bindings consumed by {@link CadRulerSystem.attachViewports}.
 */
export function buildCadRulerBindingsFromViewports(
  scene: THREE.Scene,
  viewports: readonly EditorViewport[],
): CadRulerViewportBinding[] {
  return viewports.map((viewport) => ({
    scene,
    camera: viewport.getCamera(),
    renderer: viewport.getRenderer(),
    container: viewport.getContentElement(),
    viewPlane: getCadViewPlaneForKind(viewport.getViewportKind()),
  }));
}

/**
 * Reattaches CAD rulers to the current interactive viewport set and rebuilds
 * selection dimensions so overlays stay in sync after pane open/close/kind
 * changes.
 *
 * @param host Layout surface that owns the shared CAD ruler system.
 * @param scene Shared world scene for ruler geometry.
 * @param viewports Live interactive viewports to bind.
 */
export function reattachCadRulersToViewports(
  host: LayoutCadRulerHost,
  scene: THREE.Scene,
  viewports: readonly EditorViewport[],
): void {
  const bindings = buildCadRulerBindingsFromViewports(scene, viewports);
  host.cadRulerSystem.attachViewports(bindings);
  refreshCadRulersFromSelection(host);
}

/**
 * Rebuilds CAD size dimensions for the current object selection.
 *
 * @param host CAD ruler host.
 */
export function refreshCadRulersFromSelection(host: LayoutCadRulerHost): void {
  const selected = filterUnlockedObjects(host.selectionManager.getAllSelectedObjectsAsArray());
  host.cadRulerSystem.setSelectionMeshes(selected);
}

/**
 * Drives CAD ghost bounds and delta rulers during transform interaction.
 *
 * @param host CAD ruler host.
 * @param meshes Selected meshes involved in the transform.
 * @param phase Drag lifecycle phase.
 */
export function onCadRulerTransformFeedback(
  host: LayoutCadRulerHost,
  meshes: THREE.Mesh[],
  phase: 'begin' | 'move' | 'end',
): void {
  if (phase === 'end') {
    host.cadRulerSystem.endDrag();
    host.cadRulerSystem.setSelectionMeshes(meshes);
    return;
  }
  if (phase === 'begin') {
    beginCadRulerDrag(host, meshes);
    return;
  }
  updateCadRulerDrag(host, meshes);
  publishCadRulerStatus(host);
}

/**
 * Captures pre-drag bounds for CAD ghost wireframes and delta chains.
 *
 * @param host CAD ruler host.
 * @param meshes Selected meshes at pointer-down.
 */
export function beginCadRulerDrag(host: LayoutCadRulerHost, meshes: THREE.Mesh[]): void {
  const startBounds = host.transformHandler.getDragStartBounds() ?? host.rulerBoundsBuilder.buildFromMeshes(meshes);
  host.cadRulerSystem.beginDrag(startBounds, resolveCadRulerDragMode(host));
  host.cadRulerSystem.updateLiveSelectionMeshes(meshes);
}

/**
 * Chooses CAD feedback mode: face-travel for resize/scale, translation path for
 * move tools.
 *
 * @param host CAD ruler host.
 * @returns Drag mode for the ruler system.
 */
export function resolveCadRulerDragMode(host: LayoutCadRulerHost): 'translate' | 'resize' {
  if (host.transformHandler.isBoundsResizeDrag()) return 'resize';
  if (host.transformGizmo.getMode() === TransformMode.SCALE) return 'resize';
  return 'translate';
}

/**
 * Updates CAD drag feedback from live mesh poses. Resize uses face travel;
 * translate uses actual bounds center motion (includes grid snap).
 *
 * @param host CAD ruler host.
 * @param meshes Selected meshes during drag.
 */
export function updateCadRulerDrag(host: LayoutCadRulerHost, meshes: THREE.Mesh[]): void {
  const liveBounds = host.rulerBoundsBuilder.buildFromMeshes(meshes);
  if (host.cadRulerSystem.getDragMode() === 'resize') {
    host.cadRulerSystem.updateResizeDrag(liveBounds);
    return;
  }
  if (host.cadRulerSystem.getDragMode() === 'translate') {
    host.cadRulerSystem.updateTranslateDragFromLiveBounds(liveBounds);
    return;
  }
  host.cadRulerSystem.updateLiveSelectionMeshes(meshes);
}

/**
 * Pushes live CAD delta text into the status bar while dragging.
 *
 * @param host CAD ruler host.
 */
export function publishCadRulerStatus(host: LayoutCadRulerHost): void {
  const status = host.cadRulerSystem.getStatusText();
  if (status.length === 0) return;
  host.statusBar?.setLastAction(status);
}
