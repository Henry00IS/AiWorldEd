import type { CameraFitCoordinator } from '../camera/camera_fit_coordinator.js';
import type { ClipPlaneHandler } from '../clip_plane/clip_plane_handler.js';
import type { FaceModeCoordinator } from '../face/face_mode_coordinator.js';
import type { SelectionVisualController } from '../../selection/object/selection_visual_controller.js';
import type { TransformGizmo } from '../../transform/gizmo/transform_gizmo.js';
import type { TransformInteractionBridge } from '../tools/transform_interaction_bridge.js';
import type { ShadingModeCoordinator } from '../camera/shading_mode_coordinator.js';
import type { ViewportSyncManager } from './viewport_sync_manager.js';
import type { EditorViewport } from '../../viewports/editor_viewport.js';
import { getGizmoPlaneForKind } from '../../viewports/editor_viewport.js';
import type { DetachedViewportWindow } from '../../viewports/detached_viewport_window.js';
import type { SharedWorldScene } from '../../viewports/shared_world_scene.js';
import type * as THREE from 'three';

/** Host surface for detached multi-monitor viewport wiring. */
export interface LayoutDetachedViewportHost {
  detachedViewportWindow: DetachedViewportWindow;
  sharedWorldScene: SharedWorldScene;
  worldObject: THREE.Group;
  transformGizmo: TransformGizmo;
  viewportSyncManager: ViewportSyncManager;
  selectionVisualController: SelectionVisualController | undefined;
  transformInteractionBridge: TransformInteractionBridge | undefined;
  faceModeCoordinator: FaceModeCoordinator | undefined;
  cameraFitCoordinator: CameraFitCoordinator | undefined;
  shadingModeCoordinator: ShadingModeCoordinator | undefined;
  clipPlaneHandler: ClipPlaneHandler | null;
  getPrimaryPerspectiveViewport(): { getCamera(): THREE.Camera } | null;
  wireClipCallbackOnViewport(viewport: EditorViewport): void;
  updateGizmoVisibility(): void;
  /** Rebinds shared CAD rulers to main + detached panes and refreshes selection. */
  attachCadRulers(): void;
}

/**
 * Points detached multi-monitor windows at the shared scene, world root, and
 * optional seed camera so each popup can allocate its own interactive
 * renderer.
 *
 * @param host Detached viewport host.
 */
export function bindDetachedViewportRenderSource(host: LayoutDetachedViewportHost): void {
  host.detachedViewportWindow.setRenderSource({
    getScene: () => host.sharedWorldScene.getScene(),
    getSeedCamera: () => host.getPrimaryPerspectiveViewport()?.getCamera() ?? null,
    getWorldObject: () => host.worldObject,
  });
}

/**
 * Wires selection, gizmo, transform, clip, face, and fit hooks on a detached
 * pane so it behaves like an in-window viewport.
 *
 * @param host Detached viewport host.
 * @param viewport Newly created or kind-switched detached viewport.
 */
export function wireDetachedViewport(host: LayoutDetachedViewportHost, viewport: EditorViewport): void {
  const plane = getGizmoPlaneForKind(viewport.getViewportKind());
  viewport.setWorldGroup(host.worldObject);
  viewport.setMeshResolveCallback((mesh) => host.viewportSyncManager.resolveToWorldMesh(mesh));
  viewport.setGizmoGroup(host.transformGizmo.getHandleGroupClone(plane));
  host.selectionVisualController?.wireViewports([viewport]);
  host.transformInteractionBridge?.wireViewports([viewport]);
  host.wireClipCallbackOnViewport(viewport);
  host.faceModeCoordinator?.rebindViewportFaceCallbacks();
  wireDetachedViewportToolbar(host, viewport);
  host.shadingModeCoordinator?.updateShadingMeshes();
  host.selectionVisualController?.refreshFromSelection();
  host.attachCadRulers();
  host.updateGizmoVisibility();
}

/**
 * Wires Fit and shading chrome that depends on main layout coordinators.
 *
 * @param host Detached viewport host.
 * @param viewport Detached editor viewport.
 */
export function wireDetachedViewportToolbar(host: LayoutDetachedViewportHost, viewport: EditorViewport): void {
  const toolbar = viewport.getViewportToolbar();
  toolbar.setOnFit(() => {
    host.cameraFitCoordinator?.fitSpecificViewport(viewport);
  });
  toolbar.setOnShadingMode((mode) => {
    viewport.setShadingMode(mode);
    toolbar.setActiveShadingMode(mode);
  });
}

/**
 * Handles teardown notification for a disposed detached viewport instance.
 *
 * @param host Detached viewport host.
 */
export function onDetachedViewportDisposed(host: LayoutDetachedViewportHost): void {
  host.faceModeCoordinator?.rebindViewportFaceCallbacks();
  host.attachCadRulers();
}
