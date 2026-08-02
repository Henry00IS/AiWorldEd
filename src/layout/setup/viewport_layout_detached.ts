import type { CoordinatorCameraFit } from '@/navigation/camera/coordinator_camera_fit.js';
import type { HandlerClipPlane } from '@/tools/clip_plane/handler_clip_plane.js';
import type { CoordinatorFaceMode } from '@/tools/face/coordinator_face_mode.js';
import type { ControllerSelectionVisual } from '@/selection/object/controller_selection_visual.js';
import type { GizmoTransform } from '@/transform/gizmo/gizmo_transform.js';
import type { BridgeTransformInteraction } from '@/tools/bridge/bridge_transform_interaction.js';
import type { CoordinatorShadingMode } from '@/navigation/camera/coordinator_shading_mode.js';
import type { ManagerViewportSync } from '@/layout/viewport/manager_viewport_sync.js';
import type { ViewportEditor } from '@/viewports/core/viewport_editor.js';
import { getGizmoPlaneForKind } from '@/viewports/core/viewport_editor.js';
import type { DetachedViewportWindow } from '@/viewports/detached/detached_viewport_window.js';
import type { SharedWorldScene } from '@/viewports/shared/shared_world_scene.js';
import type * as THREE from 'three';
import type { ViewportPresentationContext } from '@/viewports/presentation/viewport_presentation_context.js';

/** Host surface for detached multi-monitor viewport wiring. */
export interface LayoutDetachedViewportHost {
  detachedViewportWindow: DetachedViewportWindow;
  sharedWorldScene: SharedWorldScene;
  worldObject: THREE.Group;
  transformGizmo: GizmoTransform;
  viewportSyncManager: ManagerViewportSync;
  selectionVisualController: ControllerSelectionVisual | undefined;
  transformInteractionBridge: BridgeTransformInteraction | undefined;
  faceModeCoordinator: CoordinatorFaceMode | undefined;
  cameraFitCoordinator: CoordinatorCameraFit | undefined;
  shadingModeCoordinator: CoordinatorShadingMode | undefined;
  clipPlaneHandler: HandlerClipPlane | null;
  getPrimaryPerspectiveViewport(): { getCamera(): THREE.Camera } | null;
  wireClipCallbackOnViewport(viewport: ViewportEditor): void;
  updateGizmoVisibility(): void;
  /** Rebinds shared CAD rulers to main + detached panes and refreshes selection. */
  attachCadRulers(): void;
  viewportPresentationContext: ViewportPresentationContext;
  getCameraWidgetSizePx: () => number;
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
    getViewportPresentationContext: () => host.viewportPresentationContext,
    getCameraWidgetSizePx: () => host.getCameraWidgetSizePx(),
  });
}

/**
 * Wires selection, gizmo, transform, clip, face, and fit hooks on a detached
 * pane so it behaves like an in-window viewport.
 *
 * @param host Detached viewport host.
 * @param viewport Newly created or kind-switched detached viewport.
 */
export function wireDetachedViewport(host: LayoutDetachedViewportHost, viewport: ViewportEditor): void {
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
export function wireDetachedViewportToolbar(host: LayoutDetachedViewportHost, viewport: ViewportEditor): void {
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
