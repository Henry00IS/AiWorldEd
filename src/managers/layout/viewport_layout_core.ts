import * as THREE from 'three';
import { InputManager } from '../input/input_manager.js';
import { Viewport3D } from '../../viewports/viewport_3d.js';
import { Viewport2D } from '../../viewports/viewport_2d.js';
import { getCadViewPlaneForKind, type EditorViewport } from '../../viewports/editor_viewport.js';
import { SelectionManager } from '../../selection/object/selection_manager.js';
import { SelectionVisualController } from '../../selection/object/selection_visual_controller.js';
import { HierarchyReparentHandler } from '../hierarchy/hierarchy_reparent_handler.js';
import { PrimitiveCreationTool } from '../creation/primitive_creation_tool.js';
import { Toolbar } from '../../ui/toolbar.js';
import { OutlinerPanel } from '../../ui/outliner_panel.js';
import { PropertiesPanel } from '../../ui/properties/properties_panel.js';
import { TransformGizmo } from '../../transform/gizmo/transform_gizmo.js';
import { GizmoRaycaster } from '../../transform/gizmo/gizmo_raycaster.js';
import { TransformExecutor } from '../../transform/transform_executor.js';
import { TransformHandler } from '../../transform/transform_handler.js';
import { GridSnap } from '../../transform/snap/grid_snap.js';
import { SnapManager } from '../../transform/snap/snap_manager.js';
import { CommandStack } from '../../commands/command_stack.js';
import { StatusBar } from '../../ui/status_bar.js';
import { ViewportSyncManager } from './viewport_sync_manager.js';
import { PrimitiveCreationHandler } from '../creation/primitive_creation_handler.js';
import { KeyboardShortcutHandler } from '../input/keyboard_shortcut_handler.js';
import { ObjectActionHandler } from '../hierarchy/object_action_handler.js';
import { AlignmentHandler } from '../hierarchy/alignment_handler.js';
import { AlignmentAxis } from '../../types/alignment_axis.js';
import { SceneIOHandler } from '../tools/scene_io_handler.js';
import { CsgActionHandler } from '../tools/csg_action_handler.js';
import { TerrainGenerator } from '../../terrain/terrain_generator.js';
import { UvEditor } from '../../ui/uv/uv_editor.js';
import { UvEditorController } from '../texture/uv_editor_controller.js';
import { TextureBrowser } from '../../ui/texture/texture_browser.js';
import { TextureBrowserController } from '../texture/texture_browser_controller.js';
import { TextureAssignmentController } from '../texture/texture_assignment_controller.js';
import { TextureLockSettings } from '../../texture/lock/texture_lock_settings.js';
import { EditorShellBuilder } from './editor_shell_builder.js';
import { filterUnlockedObjects } from '../../utils/object_lock.js';
import { ViewportSceneBootstrap } from './viewport_scene_bootstrap.js';
import { TransformInteractionBridge } from '../tools/transform_interaction_bridge.js';
import { FaceModeCoordinator } from '../face/face_mode_coordinator.js';
import { SnapSettingsController } from '../tools/snap_settings_controller.js';
import { CameraFitCoordinator } from '../camera/camera_fit_coordinator.js';
import { ShadingModeCoordinator } from '../camera/shading_mode_coordinator.js';
import { ToolsPalette } from '../../ui/tools_palette.js';
import { ToolsPaletteController } from '../tools/tools_palette_controller.js';
import { ClipPlaneTool } from '../clip_plane/clip_plane_tool.js';
import { ClipPlaneHandler } from '../clip_plane/clip_plane_handler.js';
import { EditorToolId } from '../../types/editor_tool_id.js';
import { AboutDialog } from '../../ui/about/about_dialog.js';
import { SettingsDialog } from '../../ui/settings/settings_dialog.js';
import { EditorSettingsStore } from '../../settings/editor_settings_store.js';
import { SettingsApplicator } from '../../settings/settings_applicator.js';
import { createLayoutCoreSystems } from './layout_core_bootstrap.js';
import {
  setupViewportMaximizeControls as wireViewportMaximizeControls,
  setupViewportTypeMenus as wireViewportTypeMenus,
  syncActivePanesFromSlots as applyActivePanesFromSlots,
  wireClipCallbackOnViewport as bindClipCallbackOnViewport,
} from './layout_viewport_chrome.js';
import {
  bindDetachedViewportRenderSource as attachDetachedRenderSource,
  wireDetachedViewport as attachDetachedViewport,
  onDetachedViewportDisposed as handleDetachedViewportDisposed,
} from './layout_detached_viewport.js';
import { findPrimaryPerspectiveViewport, resolveNamedViewportFields } from './layout_named_viewports.js';
import { createWiredActionHandlers } from './layout_action_handler_factory.js';
import { SolidModelPanel } from '../../ui/solid_model_panel.js';
import { SolidModelController } from '../solid/solid_model_controller.js';
import { setupSolidModelLayout } from './layout_solid_model_setup.js';
import {
  setupCameraAndShadingCoordinators as createCameraAndShadingCoordinators,
  setupFaceModeCoordinator as createFaceModeCoordinator,
  setupToolsPaletteAndClipWiring as createToolsPaletteAndClip,
  cancelClipToolSelection,
} from './layout_coordinator_setup.js';
import { LayoutRenderLoop } from './layout_render_loop.js';
import { TransformSpace } from '../../types/transform_space.js';
import { TransformMode } from '../../types/transform_mode.js';
import { ViewportPaneLayout } from './viewport_pane_layout.js';
import { createLayoutSettingsSystem, openLayoutAboutDialog } from './layout_settings_system.js';
import { DocumentationLink } from '../../ui/documentation_link.js';
import { CadRulerSystem } from '../../rulers/cad_ruler_system.js';
import { OrientedBoundsBuilder } from '../../transform/bounds/oriented_bounds.js';
import { reattachCadRulersToViewports } from './layout_cad_ruler_bridge.js';
import { ViewportRegistry } from './viewport_registry.js';
import { SharedWebGLSurface } from '../../viewports/shared_webgl_surface.js';
import { SharedWorldScene } from '../../viewports/shared_world_scene.js';
import { MultiViewComposer } from '../../viewports/multi_view_composer.js';
import { DetachedViewportWindow } from '../../viewports/detached_viewport_window.js';

/**
 * Bootstrap and wiring base for the viewport layout manager. Owns shared fields
 * and early construction. Action and floating-panel methods live on the
 * concrete {@link ViewportLayoutManager} subclass.
 */
export abstract class ViewportLayoutCore {
  protected container: HTMLElement;
  protected viewports!: HTMLElement[];
  protected viewportArea!: HTMLElement;
  protected viewportPaneLayout!: ViewportPaneLayout;
  protected viewportRegistry!: ViewportRegistry;
  protected sharedSurface!: SharedWebGLSurface;
  protected sharedWorldScene!: SharedWorldScene;
  protected multiViewComposer!: MultiViewComposer;
  protected detachedViewportWindow: DetachedViewportWindow;
  protected sceneBootstrap!: ViewportSceneBootstrap;
  protected viewport3D!: Viewport3D;
  protected viewport2DTop!: Viewport2D;
  protected viewport2DFront!: Viewport2D;
  protected viewport2DSide!: Viewport2D;
  protected inputManager!: InputManager;
  protected worldObject!: THREE.Group;
  protected isDisposed: boolean;
  protected readonly renderLoop: LayoutRenderLoop;
  protected selectionManager!: SelectionManager;
  protected selectionVisualController!: SelectionVisualController;
  protected hierarchyReparentHandler!: HierarchyReparentHandler;
  protected primitiveTool!: PrimitiveCreationTool;
  protected toolbar!: Toolbar;
  protected outlinerPanel!: OutlinerPanel;
  protected propertiesPanel!: PropertiesPanel;
  protected toolbarContainer!: HTMLElement;
  protected transformGizmo!: TransformGizmo;
  protected gizmoRaycaster!: GizmoRaycaster;
  protected transformExecutor!: TransformExecutor;
  protected transformHandler!: TransformHandler;
  protected gridSnap!: GridSnap;
  protected userSnapEnabled!: boolean;
  protected transformSpace!: TransformSpace;
  protected snapManager!: SnapManager;
  protected commandStack!: CommandStack;
  protected statusBar!: StatusBar | null;
  protected viewportSyncManager!: ViewportSyncManager;
  protected primitiveCreationHandler!: PrimitiveCreationHandler;
  protected keyboardShortcutHandler!: KeyboardShortcutHandler;
  protected objectActionHandler!: ObjectActionHandler;
  protected alignmentHandler!: AlignmentHandler;
  protected sceneIOHandler!: SceneIOHandler;
  protected faceModeCoordinator!: FaceModeCoordinator;
  protected snapSettingsController!: SnapSettingsController;
  protected cameraFitCoordinator!: CameraFitCoordinator;
  protected shadingModeCoordinator!: ShadingModeCoordinator;
  protected transformInteractionBridge!: TransformInteractionBridge;
  protected csgActionHandler!: CsgActionHandler;
  protected terrainGenerator!: TerrainGenerator;
  protected uvEditor!: UvEditor | null;
  protected uvEditorController!: UvEditorController | null;
  protected textureBrowser!: TextureBrowser | null;
  protected textureBrowserController!: TextureBrowserController | null;
  protected textureAssignmentController!: TextureAssignmentController | null;
  protected textureLock!: TextureLockSettings;
  protected toolsPalette!: ToolsPalette | null;
  protected toolsPaletteController!: ToolsPaletteController | null;
  protected aboutDialog!: AboutDialog | null;
  protected settingsDialog!: SettingsDialog | null;
  protected settingsStore!: EditorSettingsStore | null;
  protected settingsApplicator!: SettingsApplicator | null;
  protected settingsUnsubscribe!: (() => void) | null;
  protected clipPlaneTool!: ClipPlaneTool;
  protected clipPlaneHandler!: ClipPlaneHandler | null;
  protected solidModelPanel!: SolidModelPanel | null;
  protected solidModelController!: SolidModelController | null;
  protected cadRulerSystem!: CadRulerSystem;
  protected rulerBoundsBuilder!: OrientedBoundsBuilder;

  /**
   * Creates the viewport layout with toolbar, outliner, and four viewports.
   *
   * @param editorContainer The root DOM element for the editor UI.
   */
  constructor(editorContainer: HTMLElement) {
    this.container = editorContainer;
    this.isDisposed = false;
    this.renderLoop = new LayoutRenderLoop();
    this.detachedViewportWindow = new DetachedViewportWindow({
      hooks: {
        onViewportReady: (viewport) => this.wireDetachedViewport(viewport),
        onViewportDisposed: (viewport) => this.onDetachedViewportDisposed(viewport),
        onPopupWindowReady: (popup) => this.keyboardShortcutHandler?.registerOnWindow(popup),
        onPopupWindowClosed: (popup) => this.keyboardShortcutHandler?.unregisterFromWindow(popup),
        prepareViewportPass: (viewport) => {
          this.cadRulerSystem.prepareForCamera(viewport.getCamera());
          this.prepareDetachedBoundsGizmoScreenSpace(viewport);
        },
        finalizeViewportPass: () => this.cadRulerSystem.endCameraPass(),
      },
    });
    this.initializeCoreSystems();
    this.buildShellAndViewports();
    this.wireHandlersAndCoordinators();
    this.bindRenderLoop();
    this.watchResize();
  }

  /** Assigns core managers that do not depend on DOM layout. */
  protected initializeCoreSystems(): void {
    Object.assign(this, createLayoutCoreSystems());
    this.uvEditor = null;
    this.uvEditorController = null;
    this.textureBrowser = null;
    this.textureBrowserController = null;
    this.textureAssignmentController = null;
    this.toolsPalette = null;
    this.toolsPaletteController = null;
    this.aboutDialog = null;
    this.settingsDialog = null;
    this.settingsStore = null;
    this.settingsApplicator = null;
    this.settingsUnsubscribe = null;
    this.clipPlaneHandler = null;
    this.solidModelPanel = null;
    this.solidModelController = null;
    this.transformSpace = TransformSpace.Global;
    this.cadRulerSystem = new CadRulerSystem();
    this.rulerBoundsBuilder = new OrientedBoundsBuilder();
  }

  /** Builds the DOM shell and instantiates the four viewports. */
  protected buildShellAndViewports(): void {
    const shellBuilder = new EditorShellBuilder();
    const shell = shellBuilder.build(
      this.container,
      this.selectionManager,
      this.worldObject,
      this.commandStack,
      this.gridSnap,
      this.textureLock,
      this.hierarchyReparentHandler,
      this.createOutlinerActions(),
      this.createToolbarShellActionsBundle(),
    );
    this.toolbarContainer = shell.toolbarContainer;
    this.viewportArea = shell.viewportArea;
    this.viewports = shell.viewports;
    this.viewportPaneLayout = new ViewportPaneLayout(shell.viewportPaneGrid, this.viewports);
    this.toolbar = shell.toolbar;
    this.outlinerPanel = shell.outlinerPanel;
    this.propertiesPanel = shell.propertiesPanel;
    this.statusBar = shell.statusBar;
    this.assignViewportsFromBootstrap();
    this.syncPrimitivesToViewports();
    this.updateTransformButtons();
  }

  /** Creates viewports, sync manager, and shared scene objects. */
  protected assignViewportsFromBootstrap(): void {
    this.sharedWorldScene = new SharedWorldScene();
    this.sharedSurface = new SharedWebGLSurface(this.viewportArea);
    this.multiViewComposer = new MultiViewComposer(this.sharedSurface);
    this.sceneBootstrap = new ViewportSceneBootstrap();
    const bootstrapped = this.sceneBootstrap.createViewports(
      this.viewports,
      this.inputManager,
      this.sharedWorldScene,
      this.sharedSurface,
    );
    this.viewportRegistry = bootstrapped.registry;
    this.refreshNamedViewportFields();
    this.viewportSyncManager = new ViewportSyncManager(
      this.viewport2DTop,
      this.viewport2DFront,
      this.viewport2DSide,
      this.viewport3D,
    );
    this.sceneBootstrap.addSharedObjects(
      this.worldObject,
      bootstrapped,
      this.sharedWorldScene,
      this.viewportSyncManager,
      this.transformGizmo,
    );
    this.attachCadRulers();
    this.bindDetachedViewportRenderSource();
  }

  /**
   * Points detached multi-monitor windows at the shared scene, world root, and
   * optional seed camera so each popup can allocate its own interactive
   * renderer.
   */
  protected bindDetachedViewportRenderSource(): void {
    attachDetachedRenderSource(this.getDetachedViewportHost());
  }

  /**
   * Wires selection, gizmo, transform, clip, face, and fit hooks on a detached
   * pane so it behaves like an in-window viewport.
   *
   * @param viewport Newly created or kind-switched detached viewport.
   */
  protected wireDetachedViewport(viewport: EditorViewport): void {
    attachDetachedViewport(this.getDetachedViewportHost(), viewport);
  }

  /**
   * Handles teardown notification for a disposed detached viewport instance.
   *
   * @param _viewport Viewport that is no longer live.
   */
  protected onDetachedViewportDisposed(_viewport: EditorViewport): void {
    handleDetachedViewportDisposed(this.getDetachedViewportHost());
  }

  /**
   * Applies screen-space bounds grip sizing for a detached pane pass.
   *
   * @param viewport Detached viewport being prepared.
   */
  protected prepareDetachedBoundsGizmoScreenSpace(viewport: EditorViewport): void {
    const group = viewport.getGizmoGroup();
    if (!group) return;
    const content = viewport.getContentElement();
    const height = Math.max(1, content.clientHeight || content.offsetHeight || 512);
    const viewPlane = getCadViewPlaneForKind(viewport.getViewportKind());
    this.transformGizmo.prepareBoundsCloneForCamera(group, viewport.getCamera(), viewPlane, height);
  }

  /**
   * Builds the detached-viewport host bag for multi-monitor wiring.
   *
   * @returns Detached viewport host.
   */
  protected getDetachedViewportHost() {
    return {
      detachedViewportWindow: this.detachedViewportWindow,
      sharedWorldScene: this.sharedWorldScene,
      worldObject: this.worldObject,
      transformGizmo: this.transformGizmo,
      viewportSyncManager: this.viewportSyncManager,
      selectionVisualController: this.selectionVisualController,
      transformInteractionBridge: this.transformInteractionBridge,
      faceModeCoordinator: this.faceModeCoordinator,
      cameraFitCoordinator: this.cameraFitCoordinator,
      shadingModeCoordinator: this.shadingModeCoordinator,
      clipPlaneHandler: this.clipPlaneHandler,
      getPrimaryPerspectiveViewport: () => this.getPrimaryPerspectiveViewport(),
      wireClipCallbackOnViewport: (viewport: EditorViewport) => this.wireClipCallbackOnViewport(viewport),
      updateGizmoVisibility: () => this.updateGizmoVisibility(),
      attachCadRulers: () => this.attachCadRulers(),
    };
  }

  /**
   * Returns main-window viewports plus any open detached panes for tools that
   * must reach every interactive surface (selection, face mode, transforms).
   *
   * @returns Combined live viewport list.
   */
  protected getAllInteractiveViewports(): EditorViewport[] {
    return [...this.getAllLiveViewports(), ...this.detachedViewportWindow.getViewports()];
  }

  /**
   * Refreshes legacy named viewport fields from the registry for tests and
   * systems that still expect the default quad kinds when present.
   */
  protected refreshNamedViewportFields(): void {
    const named = resolveNamedViewportFields(this.viewportRegistry.getAllViewports());
    this.viewport2DTop = named.viewport2DTop;
    this.viewport2DFront = named.viewport2DFront;
    this.viewport2DSide = named.viewport2DSide;
    this.viewport3D = named.viewport3D;
  }

  /**
   * Returns a preferred perspective viewport, or any live viewport camera host.
   *
   * @returns Primary Viewport3D when available.
   */
  protected getPrimaryPerspectiveViewport(): Viewport3D | null {
    return findPrimaryPerspectiveViewport(this.getAllLiveViewports());
  }

  /**
   * Returns live viewports currently considered active for render and input.
   *
   * @returns Active editor viewports.
   */
  protected getActiveViewports(): EditorViewport[] {
    return this.viewportRegistry.getActiveViewports();
  }

  /**
   * Returns every live viewport instance regardless of active flag.
   *
   * @returns All viewport instances.
   */
  protected getAllLiveViewports(): EditorViewport[] {
    return this.viewportRegistry.getAllViewports();
  }

  /**
   * Returns a primary scene for tools that need a single scene root.
   *
   * @returns Host scene when available, otherwise the first live scene.
   */
  protected getPrimaryScene(): THREE.Scene {
    return this.sharedWorldScene.getScene();
  }

  /**
   * Attaches CAD ruler overlays to every interactive viewport (main-window
   * panes and open detached multi-monitor panes) using the shared world scene.
   */
  protected attachCadRulers(): void {
    reattachCadRulersToViewports(
      this.getCadRulerHost(),
      this.sharedWorldScene.getScene(),
      this.getAllInteractiveViewports(),
    );
  }

  /** Wires specialized handlers after viewports and shell exist. */
  protected wireHandlersAndCoordinators(): void {
    this.createSelectionAndPrimitiveHandlers();
    this.createActionHandlers();
    this.refreshOutliner();
    this.wireSelectionSystem();
    this.setupTransformSystem();
    this.ensureSettingsSystem();
    this.setupKeyboardShortcuts();
    this.sceneIOHandler = new SceneIOHandler();
    this.setupCameraAndShadingCoordinators();
    this.setupFaceModeCoordinator();
    this.setupUvEditor();
    this.setupTextureBrowser();
    this.setupToolsPaletteAndClip();
    this.setupSolidModelPanel();
    this.setupSnapSettingsController();
  }

  /** Creates selection visuals and primitive creation wiring. */
  protected createSelectionAndPrimitiveHandlers(): void {
    this.selectionVisualController = new SelectionVisualController(this.selectionManager, this.viewportSyncManager);
    this.primitiveCreationHandler = new PrimitiveCreationHandler(
      this.primitiveTool,
      this.worldObject,
      this.commandStack,
      this.selectionManager,
    );
    this.primitiveCreationHandler.setOnPrimitiveCreated(() => this.onPrimitiveCreated());
    this.primitiveCreationHandler.setActiveCameraProvider(() => this.getActiveSpawnCamera());
    this.primitiveCreationHandler.setGridIntervalProvider(() => this.gridSnap.getInterval());
  }

  /**
   * Returns the camera from the active viewport for object spawn placement.
   *
   * @returns Active viewport camera, falling back to the 3D camera.
   */
  protected getActiveSpawnCamera(): THREE.Camera {
    const coordinator = this.shadingModeCoordinator;
    if (coordinator) {
      const viewport = coordinator.getOrderedViewports()[coordinator.getActiveViewportIndex()];
      if (viewport) return viewport.getCamera();
    }
    return this.getActiveViewports()[0]?.getCamera() ?? this.viewport3D.getCamera();
  }

  /** Creates object, CSG, and alignment action handlers. */
  protected createActionHandlers(): void {
    const handlers = createWiredActionHandlers(
      this.worldObject,
      this.commandStack,
      this.selectionManager,
      this.gridSnap,
      {
        // Full mutation refresh: clones, selection/hulls, CAD rulers, gizmo.
        syncViewports: () => this.refreshAfterWorldMutation(),
        refreshOutliner: () => this.refreshOutliner(),
        showStatusMessage: (message) => this.showStatusMessage(message),
        onAxisRestrictionChanged: (axis) => this.onAxisRestrictionChanged(axis),
        statusBar: this.statusBar,
      },
    );
    this.objectActionHandler = handlers.objectActionHandler;
    this.csgActionHandler = handlers.csgActionHandler;
    this.alignmentHandler = handlers.alignmentHandler;
  }

  /** Creates camera fit and shading coordinators and binds their controls. */
  protected setupCameraAndShadingCoordinators(): void {
    const setup = createCameraAndShadingCoordinators({
      selectionManager: this.selectionManager,
      statusBar: this.statusBar,
      keyboardShortcutHandler: this.keyboardShortcutHandler,
      getViewports: () => this.getAllLiveViewports(),
      getViewportElements: () => this.viewportRegistry.getContainers(),
      selectionVisualController: this.selectionVisualController,
    });
    this.cameraFitCoordinator = setup.cameraFitCoordinator;
    this.shadingModeCoordinator = setup.shadingModeCoordinator;
    this.setupViewportMaximizeControls();
    this.setupViewportTypeMenus();
  }

  /** Wires maximize/restore actions on all viewport overlay toolbars. */
  protected setupViewportMaximizeControls(): void {
    wireViewportMaximizeControls(this.getViewportChromeHost());
  }

  /**
   * Syncs registry active flags from classic grid slot names (top/front/side/
   * perspective).
   *
   * @param slots Visible slot names from the pane layout.
   */
  protected syncActivePanesFromSlots(slots: readonly string[]): void {
    applyActivePanesFromSlots(this.getViewportChromeHost(), slots);
  }

  /** Wires the viewport kind dropdown on every live toolbar. */
  protected setupViewportTypeMenus(): void {
    wireViewportTypeMenus(this.getViewportChromeHost());
  }

  /**
   * Binds the clip-plane pointer callback on one viewport when the tool exists.
   *
   * @param viewport Viewport to wire.
   */
  protected wireClipCallbackOnViewport(viewport: EditorViewport): void {
    bindClipCallbackOnViewport(this.getViewportChromeHost(), viewport);
  }

  /**
   * Builds the chrome host bag for maximize, type menu, and clip wiring.
   *
   * @returns Viewport chrome host.
   */
  protected getViewportChromeHost() {
    return {
      viewportRegistry: this.viewportRegistry,
      viewportPaneLayout: this.viewportPaneLayout,
      viewportSyncManager: this.viewportSyncManager,
      worldObject: this.worldObject,
      transformGizmo: this.transformGizmo,
      selectionVisualController: this.selectionVisualController,
      transformInteractionBridge: this.transformInteractionBridge,
      shadingModeCoordinator: this.shadingModeCoordinator,
      faceModeCoordinator: this.faceModeCoordinator,
      clipPlaneHandler: this.clipPlaneHandler,
      resizeAll: () => this.resizeAll(),
      attachCadRulers: () => this.attachCadRulers(),
      refreshNamedViewportFields: () => this.refreshNamedViewportFields(),
      showStatusMessage: (message: string) => this.showStatusMessage(message),
    };
  }

  /**
   * Builds the CAD ruler host bag for selection and transform feedback.
   *
   * @returns CAD ruler host.
   */
  protected getCadRulerHost() {
    return {
      cadRulerSystem: this.cadRulerSystem,
      rulerBoundsBuilder: this.rulerBoundsBuilder,
      transformHandler: this.transformHandler,
      transformGizmo: this.transformGizmo,
      selectionManager: this.selectionManager,
      statusBar: this.statusBar,
    };
  }

  /** Creates the face selection/extrusion coordinator. */
  protected setupFaceModeCoordinator(): void {
    this.faceModeCoordinator = createFaceModeCoordinator({
      getViewports: () => this.getAllInteractiveViewports(),
      getPrimaryScene: () => this.getPrimaryScene(),
      commandStack: this.commandStack,
      gridSnap: this.gridSnap,
      worldObject: this.worldObject,
      selectionManager: this.selectionManager,
      statusBar: this.statusBar,
      keyboardShortcutHandler: this.keyboardShortcutHandler,
      showStatusMessage: (message) => this.showStatusMessage(message),
      syncPrimitivesToViewports: () => this.syncPrimitivesToViewports(),
      updateShadingMeshes: () => this.shadingModeCoordinator.updateShadingMeshes(),
      refreshOutliner: () => this.refreshOutliner(),
      onSelectionModeUiChanged: () => {
        this.toolsPaletteController?.onExternalSelectionModeChanged(this.faceModeCoordinator.getSelectionMode());
        this.updateGizmoVisibility();
        this.updateGizmoPivot();
      },
    });
  }

  /** Creates the floating Tools palette, clip plane tool, and related wiring. */
  protected setupToolsPaletteAndClip(): void {
    const result = createToolsPaletteAndClip({
      worldObject: this.worldObject,
      commandStack: this.commandStack,
      selectionManager: this.selectionManager,
      gridSnap: this.gridSnap,
      clipPlaneTool: this.clipPlaneTool,
      faceModeCoordinator: this.faceModeCoordinator,
      toolbarContainer: this.toolbarContainer,
      anchorViewport: this.viewports[3] ?? this.viewports[0]!,
      getViewports: () => this.getAllLiveViewports(),
      keyboardShortcutHandler: this.keyboardShortcutHandler,
      showStatusMessage: (message) => this.showStatusMessage(message),
      syncPrimitivesToViewports: () => this.syncPrimitivesToViewports(),
      refreshOutliner: () => this.refreshOutliner(),
      updateShadingMeshes: () => this.shadingModeCoordinator.updateShadingMeshes(),
      onToolStateChanged: () => this.onClipToolStateChanged(),
      onClipCancel: () => this.onClipCancel(),
      onTransformMode: (mode) => this.onTransformMode(mode),
      onOpenUvEditor: () => this.onToggleUvEditor(),
    });
    this.clipPlaneHandler = result.clipPlaneHandler;
    this.toolsPalette = result.toolsPalette;
    this.toolsPaletteController = result.toolsPaletteController;
    this.renderLoop.setClipPlaneHandler(result.clipPlaneHandler);
  }

  /** Cancels the clip tool and returns to object select in the palette. */
  protected onClipCancel(): void {
    cancelClipToolSelection(this.clipPlaneHandler, this.toolsPaletteController);
  }

  /** Refreshes palette context and hides transform gizmos while clipping. */
  protected onClipToolStateChanged(): void {
    this.toolsPaletteController?.refreshPaletteContext();
    this.updateGizmoVisibility();
  }

  /** Shows or hides transform/bounds gizmos based on selection and active tools. */
  protected updateGizmoVisibility(): void {
    const selected = this.selectionManager.getAllSelectedObjectsAsArray();
    const unlockedSelected = filterUnlockedObjects(selected);
    this.transformGizmo.setVisible(
      unlockedSelected.length > 0 && !this.isFaceSelectionModeActive() && !this.isClipPlaneToolActive(),
    );
  }

  /** Clears selection, cancels active tools, and returns to object select. */
  protected onEscapeCancel(): void {
    this.clipPlaneHandler?.cancel();
    this.toolsPaletteController?.selectTool(EditorToolId.OBJECT);
    this.faceModeCoordinator?.getFaceExtrusionController().clearFaceSelection();
    this.selectionManager.clearSelection();
    this.statusBar?.setLastAction('Selection cleared');
  }

  /** Toggles the floating Tools palette. */
  protected onToggleToolsPalette(): void {
    this.toolsPalette?.toggle();
    if (this.toolsPalette?.isOpen()) {
      this.statusBar?.setLastAction('Tools palette opened');
    }
  }

  /** Creates the solid model floating panel and controller. */
  protected setupSolidModelPanel(): void {
    const setup = setupSolidModelLayout({
      worldObject: this.worldObject,
      commandStack: this.commandStack,
      selectionManager: this.selectionManager,
      propertiesPanel: this.propertiesPanel,
      toolbarContainer: this.toolbarContainer,
      solidPanelAnchor: this.viewports[3]!,
      viewportSyncManager: this.viewportSyncManager,
      viewport3D: this.viewport3D,
      gridSnap: this.gridSnap,
      textureLock: this.textureLock,
      refreshAfterWorldMutation: () => this.refreshAfterWorldMutation(),
      refreshOutliner: () => this.refreshOutliner(),
      showStatusMessage: (message) => this.showStatusMessage(message),
    });
    this.solidModelPanel = setup.solidModelPanel;
    this.solidModelController = setup.solidModelController;
    this.solidModelController.setTransformModeProvider(() => this.transformHandler.getMode());
    this.solidModelController.setActiveCameraProvider(() => this.getActiveSpawnCamera());
    // Startup seeds a solid model before this panel exists; claim it as active.
    this.solidModelController.adoptFirstSolidModelInWorld();
  }

  /** Toggles the solid model floating panel. */
  protected onToggleSolidModelPanel(): void {
    this.solidModelController?.togglePanel();
    if (this.solidModelPanel?.isOpen()) {
      this.statusBar?.setLastAction('Solid Model panel opened');
    }
  }

  /** Creates a solid model with a default box brush. */
  protected onAddSolidModel(): void {
    this.solidModelController?.createSolidModel();
  }

  /** Opens the About dialog, creating it on first use. */
  protected onOpenAboutDialog(): void {
    this.aboutDialog = openLayoutAboutDialog(this.container, this.aboutDialog, this.statusBar);
  }

  /**
   * Opens another detached viewport window for multi-monitor use. Each open
   * allocates its own WebGL surface; closed popups release that budget.
   */
  protected onOpenDetachedViewport(): void {
    this.bindDetachedViewportRenderSource();
    const opened = this.detachedViewportWindow.open();
    if (opened) {
      const count = this.detachedViewportWindow.getOpenCount();
      this.showStatusMessage(count === 1 ? 'Detached viewport opened' : `Detached viewport opened (${count} open)`);
      return;
    }
    this.showStatusMessage('Could not open detached viewport (popup blocked?)');
  }

  /** Opens the hosted user documentation in a separate browser tab. */
  protected onOpenDocumentation(): void {
    new DocumentationLink().open();
    this.statusBar?.setLastAction('Documentation opened');
  }

  /** Toggles the Settings dialog, creating store and dialog on first use. */
  protected onToggleSettingsDialog(): void {
    this.ensureSettingsSystem();
    this.settingsDialog?.toggle();
    if (this.settingsDialog?.isOpen()) {
      this.statusBar?.setLastAction('Settings opened');
      return;
    }
    this.statusBar?.setLastAction('Settings closed');
  }

  /** Lazily creates the settings store, applicator, and dialog. */
  protected ensureSettingsSystem(): void {
    if (this.settingsStore && this.settingsDialog) {
      return;
    }
    const parts = createLayoutSettingsSystem({
      container: this.container,
      viewport3D: this.viewport3D,
      viewportPaneLayout: this.viewportPaneLayout,
      toolbar: this.toolbar,
      resizeAll: () => this.resizeAll(),
      onVisibleSlots: (slots) => this.syncActivePanesFromSlots(slots),
    });
    this.settingsStore = parts.settingsStore;
    this.settingsApplicator = parts.settingsApplicator;
    this.settingsDialog = parts.settingsDialog;
    this.settingsUnsubscribe = parts.settingsUnsubscribe;
  }

  /** Creates and initializes the snap settings controller. */
  protected setupSnapSettingsController(): void {
    this.snapSettingsController = new SnapSettingsController({
      gridSnap: this.gridSnap,
      snapManager: this.snapManager,
      textureLock: this.textureLock,
      toolbar: this.toolbar,
      statusBar: this.statusBar,
      keyboardShortcutHandler: this.keyboardShortcutHandler,
      worldObject: this.worldObject,
      getViewports: () => this.getAllLiveViewports(),
      getUserSnapEnabled: () => this.userSnapEnabled,
      setUserSnapEnabled: (enabled) => {
        this.userSnapEnabled = enabled;
      },
    });
    this.snapSettingsController.setup();
  }

  /**
   * Builds outliner action callbacks for the shell builder.
   *
   * @returns Outliner action callback bundle.
   */
  protected abstract createOutlinerActions(): import('./editor_shell_builder.js').EditorShellOutlinerActions;

  /**
   * Builds toolbar action callbacks for the shell builder.
   *
   * @returns Toolbar action callback bundle.
   */
  protected abstract createToolbarShellActionsBundle(): import('./editor_shell_builder.js').EditorToolbarActions;

  /** Binds the shared render loop to live viewports and coordinators. */
  protected abstract bindRenderLoop(): void;

  /** Creates ResizeObserver-based resize handling for workspace and panes. */
  protected abstract watchResize(): void;

  /** Syncs world objects into clone viewports and selection visuals. */
  protected abstract syncPrimitivesToViewports(): void;

  /** Updates tools palette transform highlights and status bar mode text. */
  protected abstract updateTransformButtons(): void;

  /** Refreshes the outliner panel from the live world hierarchy. */
  protected abstract refreshOutliner(): void;

  /** Wires selection state, outlines, and gizmo visibility across viewports. */
  protected abstract wireSelectionSystem(): void;

  /** Sets up the transform gizmo system and event wiring. */
  protected abstract setupTransformSystem(): void;

  /** Sets up keyboard shortcuts using the dedicated shortcut handler. */
  protected abstract setupKeyboardShortcuts(): void;

  /** Creates the floating UV editor panel and controller. */
  protected abstract setupUvEditor(): void;

  /** Creates the floating texture browser, library wiring, and assignment. */
  protected abstract setupTextureBrowser(): void;

  /** Handles post-primitive-creation synchronization and UI refresh. */
  protected abstract onPrimitiveCreated(): void;

  /** Full visual refresh after hierarchy/world mutations. */
  protected abstract refreshAfterWorldMutation(): void;

  /**
   * Displays a message in the status bar.
   *
   * @param message The message text to display.
   */
  protected abstract showStatusMessage(message: string): void;

  /**
   * Updates the status bar axis restriction display.
   *
   * @param axis The active alignment axis restriction.
   */
  protected abstract onAxisRestrictionChanged(axis: AlignmentAxis): void;

  /** Resizes the shared surface and every active pane camera. */
  protected abstract resizeAll(): void;

  /** Updates the gizmo pivot to the selection center. */
  protected abstract updateGizmoPivot(): void;

  /**
   * Handles transform mode change from toolbar or keyboard.
   *
   * @param mode The new transform mode to activate.
   */
  protected abstract onTransformMode(mode: TransformMode): void;

  /** Toggles the UV editor panel. */
  protected abstract onToggleUvEditor(): void;

  /**
   * Returns whether face selection mode is currently active.
   *
   * @returns True when the editor is in face selection mode.
   */
  protected abstract isFaceSelectionModeActive(): boolean;

  /**
   * Returns whether the clip plane tool is currently active.
   *
   * @returns True when clip placement is live.
   */
  protected abstract isClipPlaneToolActive(): boolean;
}
