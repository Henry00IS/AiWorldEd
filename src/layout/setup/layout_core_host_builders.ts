import type * as THREE from 'three';
import type { CoordinatorCameraFit } from '@/navigation/camera/coordinator_camera_fit.js';
import type { CoordinatorShadingMode } from '@/navigation/camera/coordinator_shading_mode.js';
import type { HandlerClipPlane } from '@/tools/clip_plane/handler_clip_plane.js';
import type { CoordinatorFaceMode } from '@/tools/face/coordinator_face_mode.js';
import type { ControllerAreaLayout } from '@/layout/area/controller_area_layout.js';
import type { AreaLayoutInteraction } from '@/layout/area/area_layout_interaction.js';
import type { LayoutCadRulerHost } from '@/layout/setup/bridge_layout_cad_ruler.js';
import type { LayoutDetachedViewportHost } from '@/layout/setup/viewport_layout_detached.js';
import type { LayoutViewportChromeHost } from '@/layout/setup/layout_viewport_chrome.js';
import type { WorkspaceAreaWiringHost } from '@/layout/setup/layout_workspace_area_wiring.js';
import type { ViewportPaneLayout } from '@/layout/viewport/viewport_pane_layout.js';
import type { ViewportRegistry } from '@/layout/viewport/viewport_registry.js';
import type { ManagerViewportSync } from '@/layout/viewport/manager_viewport_sync.js';
import type { ControllerWorkspace } from '@/layout/workspace/controller_workspace.js';
import type { WorkspaceStore } from '@/layout/workspace/workspace_store.js';
import type { ManagerSelection } from '@/selection/object/manager_selection.js';
import type { ControllerSelectionVisual } from '@/selection/object/controller_selection_visual.js';
import type { CadRulerSystem } from '@/rulers/system/cad_ruler_system.js';
import type { BuilderOrientedBounds } from '@/transform/bounds/builder_oriented_bounds.js';
import type { GizmoTransform } from '@/transform/gizmo/gizmo_transform.js';
import type { HandlerTransform } from '@/transform/core/handler_transform.js';
import type { BridgeTransformInteraction } from '@/tools/bridge/bridge_transform_interaction.js';
import type { PolicyEditorOverlay } from '@/tools/overlay/policy_editor_overlay.js';
import type { StatusBar } from '@/ui/status/status_bar.js';
import type { WorkspaceSwitcherBar } from '@/ui/workspace/workspace_switcher_bar.js';
import type { ViewportEditor } from '@/viewports/core/viewport_editor.js';
import type { DetachedViewportWindow } from '@/viewports/detached/detached_viewport_window.js';
import type { SharedWorldScene } from '@/viewports/shared/shared_world_scene.js';
import type { ViewportKind } from '@/viewports/core/viewport_kind.js';
import type { ViewportPresentationContext } from '@/viewports/presentation/viewport_presentation_context.js';

/** Field source used to assemble layout host bags without circular imports. */
export interface LayoutCoreHostSource {
  toolbarContainer: HTMLElement;
  viewportArea: HTMLElement;
  viewportPaneGrid: HTMLElement;
  workspaceStore: WorkspaceStore;
  workspaceController: ControllerWorkspace | null;
  workspaceSwitcherBar: WorkspaceSwitcherBar | null;
  areaLayoutInteraction: AreaLayoutInteraction | null;
  viewportRegistry: ViewportRegistry;
  viewportPaneLayout: ViewportPaneLayout;
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
  cadRulerSystem: CadRulerSystem;
  rulerBoundsBuilder: BuilderOrientedBounds;
  transformHandler: HandlerTransform;
  selectionManager: ManagerSelection;
  statusBar: StatusBar | null;
  editorOverlayPolicy: PolicyEditorOverlay;
  viewportPresentationContext: ViewportPresentationContext;
  getCameraWidgetSizePx: () => number;
  /**
   * Assigns the workspace controller field.
   *
   * @param controller New controller.
   */
  setWorkspaceController(controller: ControllerWorkspace | null): void;
  /**
   * Assigns the workspace switcher bar field.
   *
   * @param bar New switcher bar.
   */
  setWorkspaceSwitcherBar(bar: WorkspaceSwitcherBar | null): void;
  /**
   * Assigns the area layout interaction field.
   *
   * @param interaction New interaction helper.
   */
  setAreaLayoutInteraction(interaction: AreaLayoutInteraction | null): void;
  /**
   * Returns the chrome host bag.
   *
   * @returns Viewport chrome host.
   */
  getViewportChromeHost(): LayoutViewportChromeHost;
  /** Resizes the shared surface and every pane camera. */
  resizeAll(): void;
  /** Refreshes legacy named viewport fields from the registry. */
  refreshNamedViewportFields(): void;
  /** Rebinds tools after area structure changes. */
  rewireAfterAreaStructureChange(): void;
  /**
   * Returns the primary perspective viewport when available.
   *
   * @returns Perspective viewport or null.
   */
  getPrimaryPerspectiveViewport(): { getCamera(): THREE.Camera } | null;
  /**
   * Wires clip callbacks on one viewport.
   *
   * @param viewport Viewport to wire.
   */
  wireClipCallbackOnViewport(viewport: ViewportEditor): void;
  /** Updates gizmo visibility for the current tool mode. */
  updateGizmoVisibility(): void;
  /** Attaches CAD rulers to interactive viewports. */
  attachCadRulers(): void;
  /**
   * Shows a status bar message.
   *
   * @param message Message text.
   */
  showStatusMessage(message: string): void;
}

/**
 * Builds the workspace and area tiling host bag.
 *
 * @param source Layout core field source.
 * @returns Workspace area wiring host.
 */
export function buildWorkspaceAreaWiringHost(source: LayoutCoreHostSource): WorkspaceAreaWiringHost {
  return {
    getToolbarContainer: () => source.toolbarContainer,
    getViewportArea: () => source.viewportArea,
    getViewportPaneGrid: () => source.viewportPaneGrid,
    getWorkspaceStore: () => source.workspaceStore,
    getWorkspaceController: () => source.workspaceController,
    getWorkspaceSwitcherBar: () => source.workspaceSwitcherBar,
    getAreaLayoutInteraction: () => source.areaLayoutInteraction,
    getViewportRegistry: () => source.viewportRegistry,
    getAreaLayoutController: () => source.viewportPaneLayout.getAreaLayoutController() as ControllerAreaLayout,
    setWorkspaceController: (controller) => {
      source.workspaceController = controller;
      source.setWorkspaceController(controller);
    },
    setWorkspaceSwitcherBar: (bar) => {
      source.workspaceSwitcherBar = bar;
      source.setWorkspaceSwitcherBar(bar);
    },
    setAreaLayoutInteraction: (interaction) => {
      source.areaLayoutInteraction = interaction;
      source.setAreaLayoutInteraction(interaction);
    },
    openDetachedViewport: (viewportKind: ViewportKind) =>
      source.detachedViewportWindow.open({ initialKind: viewportKind }),
    getViewportChromeHost: () => source.getViewportChromeHost(),
    resizeAll: () => source.resizeAll(),
    refreshNamedViewportFields: () => source.refreshNamedViewportFields(),
    rewireAfterAreaStructureChange: () => source.rewireAfterAreaStructureChange(),
  };
}

/**
 * Builds the detached multi-monitor viewport host bag.
 *
 * @param source Layout core field source.
 * @returns Detached viewport host.
 */
export function buildDetachedViewportHost(source: LayoutCoreHostSource): LayoutDetachedViewportHost {
  return {
    detachedViewportWindow: source.detachedViewportWindow,
    sharedWorldScene: source.sharedWorldScene,
    worldObject: source.worldObject,
    transformGizmo: source.transformGizmo,
    viewportSyncManager: source.viewportSyncManager,
    selectionVisualController: source.selectionVisualController,
    transformInteractionBridge: source.transformInteractionBridge,
    faceModeCoordinator: source.faceModeCoordinator,
    cameraFitCoordinator: source.cameraFitCoordinator,
    shadingModeCoordinator: source.shadingModeCoordinator,
    clipPlaneHandler: source.clipPlaneHandler,
    getPrimaryPerspectiveViewport: () => source.getPrimaryPerspectiveViewport(),
    wireClipCallbackOnViewport: (viewport: ViewportEditor) => source.wireClipCallbackOnViewport(viewport),
    updateGizmoVisibility: () => source.updateGizmoVisibility(),
    attachCadRulers: () => source.attachCadRulers(),
    viewportPresentationContext: source.viewportPresentationContext,
    getCameraWidgetSizePx: source.getCameraWidgetSizePx,
  };
}

/**
 * Builds the viewport chrome host bag.
 *
 * @param source Layout core field source.
 * @returns Viewport chrome host.
 */
export function buildViewportChromeHost(source: LayoutCoreHostSource): LayoutViewportChromeHost {
  return {
    viewportRegistry: source.viewportRegistry,
    viewportPaneLayout: source.viewportPaneLayout,
    viewportSyncManager: source.viewportSyncManager,
    worldObject: source.worldObject,
    transformGizmo: source.transformGizmo,
    selectionVisualController: source.selectionVisualController,
    transformInteractionBridge: source.transformInteractionBridge,
    shadingModeCoordinator: source.shadingModeCoordinator,
    faceModeCoordinator: source.faceModeCoordinator,
    clipPlaneHandler: source.clipPlaneHandler,
    resizeAll: () => source.resizeAll(),
    attachCadRulers: () => source.attachCadRulers(),
    refreshNamedViewportFields: () => source.refreshNamedViewportFields(),
    showStatusMessage: (message: string) => source.showStatusMessage(message),
    persistActiveWorkspaceLayout: () => source.workspaceController?.persistCurrentIntoActive(),
  };
}

/**
 * Builds the CAD ruler host bag.
 *
 * @param source Layout core field source.
 * @returns CAD ruler host.
 */
export function buildCadRulerHost(source: LayoutCoreHostSource): LayoutCadRulerHost {
  return {
    cadRulerSystem: source.cadRulerSystem,
    rulerBoundsBuilder: source.rulerBoundsBuilder,
    transformHandler: source.transformHandler,
    transformGizmo: source.transformGizmo,
    selectionManager: source.selectionManager,
    statusBar: source.statusBar,
    editorOverlayPolicy: source.editorOverlayPolicy,
  };
}
