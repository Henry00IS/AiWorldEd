import * as THREE from 'three';
import { ManagerInput } from '@/input/manager_input.js';
import { Viewport3D } from '@/viewports/core/viewport_3d.js';
import { Viewport2D } from '@/viewports/core/viewport_2d.js';
import { getCadViewPlaneForKind, type ViewportEditor } from '@/viewports/core/viewport_editor.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { ControllerSelectionVisual } from '@/selection/object/controller_selection_visual.js';
import { HandlerHierarchyReparent } from '@/outliner/hierarchy/handler_hierarchy_reparent.js';
import { ToolPrimitiveCreation } from '@/tools/creation/tool_primitive_creation.js';
import { Toolbar } from '@/ui/toolbar/toolbar.js';
import { PanelOutliner } from '@/outliner/ui/panel_outliner.js';
import { PanelProperties } from '@/ui/properties/panel_properties.js';
import { GizmoTransform } from '@/transform/gizmo/gizmo_transform.js';
import { GizmoRaycaster } from '@/transform/gizmo/gizmo_raycaster.js';
import { TransformExecutor } from '@/transform/core/transform_executor.js';
import { HandlerTransform } from '@/transform/core/handler_transform.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { ManagerSnap } from '@/transform/snap/manager_snap.js';
import { CommandStack } from '@/commands/command_stack.js';
import { StatusBar } from '@/ui/status/status_bar.js';
import { ManagerViewportSync } from './manager_viewport_sync.js';
import { HandlerPrimitiveCreation } from '@/tools/creation/handler_primitive_creation.js';
import { HandlerKeyboardShortcut } from '@/input/handler_keyboard_shortcut.js';
import { HandlerObjectAction } from '@/outliner/hierarchy/handler_object_action.js';
import { HandlerAlignment } from '@/outliner/alignment/handler_alignment.js';
import { AlignmentAxis } from '@/types/alignment_axis.js';
import { HandlerSceneIo } from '@/tools/io/handler_scene_io.js';
import { HandlerCsgAction } from '@/tools/csg/handler_csg_action.js';
import { TerrainGenerator } from '@/terrain/terrain_generator.js';
import { UvEditor } from '@/texture/ui/uv/uv_editor.js';
import { ControllerUvEditor } from '@/texture/controller/controller_uv_editor.js';
import { TextureBrowser } from '@/texture/ui/browser/texture_browser.js';
import { ControllerTextureBrowser } from '@/texture/controller/controller_texture_browser.js';
import { ControllerTextureAssignment } from '@/texture/controller/controller_texture_assignment.js';
import { TextureLockSettings } from '@/texture/lock/texture_lock_settings.js';
import { BuilderEditorShell } from '@/layout/shell/builder_editor_shell.js';
import { filterUnlockedObjects } from '@/utils/object_lock.js';
import { ViewportSceneBootstrap } from './viewport_scene_bootstrap.js';
import { BridgeTransformInteraction } from '@/tools/bridge/bridge_transform_interaction.js';
import type { LayoutToolEditorSystem } from '@/layout/setup/layout_tool_editor_setup.js';
import { CoordinatorFaceMode } from '@/tools/face/coordinator_face_mode.js';
import { ControllerSnapSettings } from '@/tools/snap/controller_snap_settings.js';
import { CoordinatorCameraFit } from '@/navigation/camera/coordinator_camera_fit.js';
import { CoordinatorShadingMode } from '@/navigation/camera/coordinator_shading_mode.js';
import { ToolsPalette } from '@/tools/palette/ui/tools_palette.js';
import { ControllerToolsPalette } from '@/tools/palette/controller/controller_tools_palette.js';
import { PolicyEditorOverlay } from '@/tools/overlay/policy_editor_overlay.js';
import { RegistryModalToolSession } from '@/tools/session/registry_modal_tool_session.js';
import { ToolClipPlane } from '@/tools/clip_plane/tool_clip_plane.js';
import { HandlerClipPlane } from '@/tools/clip_plane/handler_clip_plane.js';
import { EditorToolId } from '@/types/editor_tool_id.js';
import { DialogAbout } from '@/ui/about/dialog_about.js';
import { DialogSettings } from '@/ui/settings/dialog_settings.js';
import { EditorSettingsStore } from '@/settings/store/editor_settings_store.js';
import { SettingsApplicator } from '@/settings/store/settings_applicator.js';
import { CAMERA_WIDGET_SIZE_DEFAULT_PX } from '@/settings/store/settings_types.js';
import { createLayoutCoreSystems } from '@/layout/setup/layout_core_bootstrap.js';
import {
  setupViewportMaximizeControls as wireViewportMaximizeControls,
  setupViewportTypeMenus as wireViewportTypeMenus,
  syncActivePanesFromSlots as applyActivePanesFromSlots,
  wireClipCallbackOnViewport as bindClipCallbackOnViewport,
} from '@/layout/setup/layout_viewport_chrome.js';
import {
  bindDetachedViewportRenderSource as attachDetachedRenderSource,
  wireDetachedViewport as attachDetachedViewport,
  onDetachedViewportDisposed as handleDetachedViewportDisposed,
} from '@/layout/setup/viewport_layout_detached.js';
import { findPrimaryPerspectiveViewport, resolveNamedViewportFields } from '@/layout/setup/layout_named_viewports.js';
import { createWiredActionHandlers } from '@/layout/setup/factory_layout_action_handler.js';
import { SolidModelPanel } from '@/solid/ui/panel/solid_model_panel.js';
import { SolidModelController } from '@/solid/controller/solid_model_controller.js';
import { setupSolidModelLayout } from '@/solid/layout/solid_model_layout_setup.js';
import { setupLayoutAi } from '@/layout/setup/layout_ai_setup.js';
import {
  setupCameraAndShadingCoordinators as createCameraAndShadingCoordinators,
  setupFaceModeCoordinator as createFaceModeCoordinator,
  setupToolsPaletteAndClipWiring as createToolsPaletteAndClip,
  cancelClipToolSelection,
} from '@/layout/setup/layout_coordinator_setup.js';
import {
  createLayoutSnapSettingsController,
  openLayoutDetachedViewport,
  openLayoutDocumentation,
  openLayoutMcpDialog,
  refreshLayoutMcpToolbarButton,
  setLayoutMcpToolbarButtonActive,
  toggleLayoutSolidModelPanel,
} from '@/layout/setup/layout_toolbar_actions.js';
import { LayoutRenderLoop } from '@/layout/setup/layout_render_loop.js';
import { TransformSpace } from '@/types/transform_space.js';
import { TransformMode } from '@/types/transform_mode.js';
import { ViewportPaneLayout } from './viewport_pane_layout.js';
import { createLayoutSettingsSystem, openLayoutAboutDialog } from '@/layout/setup/layout_settings_system.js';
import { CadRulerSystem } from '@/rulers/system/cad_ruler_system.js';
import { BuilderOrientedBounds } from '@/transform/bounds/builder_oriented_bounds.js';
import { ViewportPresentationContext } from '@/viewports/presentation/viewport_presentation_context.js';
import {
  reattachCadRulersToViewports,
  refreshCadRulersFromSelection as rebuildCadRulersFromSelection,
} from '@/layout/setup/bridge_layout_cad_ruler.js';
import { ViewportRegistry } from './viewport_registry.js';
import { SharedWebGLSurface } from '@/viewports/shared/shared_webgl_surface.js';
import { SharedWorldScene } from '@/viewports/shared/shared_world_scene.js';
import { MultiViewComposer } from '@/viewports/core/multi_view_composer.js';
import { DetachedViewportWindow } from '@/viewports/detached/detached_viewport_window.js';
import { AreaLayoutInteraction } from '@/layout/area/area_layout_interaction.js';
import { WorkspaceStore } from '@/layout/workspace/workspace_store.js';
import { ControllerWorkspace } from '@/layout/workspace/controller_workspace.js';
import { WorkspaceSwitcherBar } from '@/ui/workspace/workspace_switcher_bar.js';
import {
  type WorkspaceAreaWiringHost,
  wireWorkspaceSystem,
  wireAreaLayoutInteraction,
  refreshWorkspaceSwitcherBar,
} from '@/layout/setup/layout_workspace_area_wiring.js';
import {
  buildCadRulerHost,
  buildDetachedViewportHost,
  buildViewportChromeHost,
  buildWorkspaceAreaWiringHost,
  type LayoutCoreHostSource,
} from '@/layout/setup/layout_core_host_builders.js';

/**
 * Bootstrap and wiring base for the viewport layout manager. Owns shared fields
 * and early construction. Action and floating-panel methods live on the
 * concrete {@link ViewportLayoutManager} subclass.
 */
export abstract class ViewportLayoutCore {
  protected container: HTMLElement;
  protected viewports!: HTMLElement[];
  protected viewportArea!: HTMLElement;
  protected viewportPaneGrid!: HTMLElement;
  protected viewportPaneLayout!: ViewportPaneLayout;
  protected areaLayoutInteraction!: AreaLayoutInteraction | null;
  protected workspaceStore!: WorkspaceStore;
  protected workspaceController!: ControllerWorkspace | null;
  protected workspaceSwitcherBar!: WorkspaceSwitcherBar | null;
  protected viewportRegistry!: ViewportRegistry;
  protected sharedSurface!: SharedWebGLSurface;
  protected sharedWorldScene!: SharedWorldScene;
  protected multiViewComposer!: MultiViewComposer;
  protected detachedViewportWindow: DetachedViewportWindow;
  protected sceneBootstrap!: ViewportSceneBootstrap;
  /** Perspective viewport when present; null for orthographic-only layouts. */
  protected viewport3D: Viewport3D | null = null;
  /** Named 2D roles when present; null if that kind is not in the layout. */
  protected viewport2DTop: Viewport2D | null = null;
  protected viewport2DFront: Viewport2D | null = null;
  protected viewport2DSide: Viewport2D | null = null;
  protected inputManager!: ManagerInput;
  protected worldObject!: THREE.Group;
  protected isDisposed: boolean;
  protected readonly renderLoop: LayoutRenderLoop;
  protected selectionManager!: ManagerSelection;
  protected selectionVisualController!: ControllerSelectionVisual;
  protected hierarchyReparentHandler!: HandlerHierarchyReparent;
  protected primitiveTool!: ToolPrimitiveCreation;
  protected toolbar!: Toolbar;
  protected outlinerPanel!: PanelOutliner;
  protected propertiesPanel!: PanelProperties;
  protected toolbarContainer!: HTMLElement;
  protected transformGizmo!: GizmoTransform;
  protected gizmoRaycaster!: GizmoRaycaster;
  protected transformExecutor!: TransformExecutor;
  protected transformHandler!: HandlerTransform;
  /** Shape Editor-style single-active-tool manager (SwitchTool / UseTool). */
  protected toolEditorSystem: LayoutToolEditorSystem | null = null;
  protected gridSnap!: GridSnap;
  protected userSnapEnabled!: boolean;
  protected transformSpace!: TransformSpace;
  protected snapManager!: ManagerSnap;
  protected commandStack!: CommandStack;
  protected statusBar!: StatusBar | null;
  protected viewportSyncManager!: ManagerViewportSync;
  protected primitiveCreationHandler!: HandlerPrimitiveCreation;
  protected keyboardShortcutHandler!: HandlerKeyboardShortcut;
  protected objectActionHandler!: HandlerObjectAction;
  protected alignmentHandler!: HandlerAlignment;
  protected sceneIOHandler!: HandlerSceneIo;
  protected faceModeCoordinator!: CoordinatorFaceMode;
  protected snapSettingsController!: ControllerSnapSettings;
  protected cameraFitCoordinator!: CoordinatorCameraFit;
  protected shadingModeCoordinator!: CoordinatorShadingMode;
  protected transformInteractionBridge!: BridgeTransformInteraction;
  protected csgActionHandler!: HandlerCsgAction;
  protected terrainGenerator!: TerrainGenerator;
  protected uvEditor!: UvEditor | null;
  protected uvEditorController!: ControllerUvEditor | null;
  protected textureBrowser!: TextureBrowser | null;
  protected textureBrowserController!: ControllerTextureBrowser | null;
  protected textureAssignmentController!: ControllerTextureAssignment | null;
  protected textureLock!: TextureLockSettings;
  protected toolsPalette!: ToolsPalette | null;
  protected toolsPaletteController!: ControllerToolsPalette | null;
  protected aboutDialog!: DialogAbout | null;
  protected settingsDialog!: DialogSettings | null;
  protected settingsStore!: EditorSettingsStore | null;
  protected settingsApplicator!: SettingsApplicator | null;
  protected settingsUnsubscribe!: (() => void) | null;
  protected clipPlaneTool!: ToolClipPlane;
  protected clipPlaneHandler!: HandlerClipPlane | null;
  protected solidModelPanel!: SolidModelPanel | null;
  protected solidModelController!: SolidModelController | null;
  protected cadRulerSystem!: CadRulerSystem;
  protected rulerBoundsBuilder!: BuilderOrientedBounds;
  protected viewportPresentationContext!: ViewportPresentationContext;
  protected editorOverlayPolicy!: PolicyEditorOverlay;
  protected modalToolSessionRegistry!: RegistryModalToolSession;

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
          this.prepareDetachedGizmoBoundsScreenSpace(viewport);
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
    this.settingsStore = new EditorSettingsStore();
    this.settingsApplicator = null;
    this.settingsUnsubscribe = null;
    this.clipPlaneHandler = null;
    this.solidModelPanel = null;
    this.solidModelController = null;
    this.transformSpace = TransformSpace.Global;
    this.cadRulerSystem = new CadRulerSystem();
    this.rulerBoundsBuilder = new BuilderOrientedBounds();
    this.viewportPresentationContext = new ViewportPresentationContext(this.settingsStore.getActiveGameProfile());
    this.cadRulerSystem.setPresentationUnits(
      this.viewportPresentationContext.toProfileUnits(1),
      this.viewportPresentationContext.getUnitLabel(),
    );
  }

  /** Builds the DOM shell and instantiates the four viewports. */
  protected buildShellAndViewports(): void {
    const shellBuilder = new BuilderEditorShell();
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
    this.viewportPaneGrid = shell.viewportPaneGrid;
    this.viewports = shell.viewports;
    this.viewportPaneLayout = new ViewportPaneLayout(shell.viewportPaneGrid, this.viewports);
    this.areaLayoutInteraction = null;
    this.workspaceStore = new WorkspaceStore();
    this.workspaceController = null;
    this.workspaceSwitcherBar = null;
    this.toolbar = shell.toolbar;
    this.outlinerPanel = shell.outlinerPanel;
    this.propertiesPanel = shell.propertiesPanel;
    this.statusBar = shell.statusBar;
    this.assignViewportsFromBootstrap();
    this.bindAreaLayoutInteraction();
    this.bindWorkspaceSystem();
    this.syncPrimitivesToViewports();
    this.updateTransformButtons();
    void this.refreshMcpToolbarButton();
  }

  /**
   * Creates the workspace controller and switcher bar after the registry
   * exists.
   */
  protected bindWorkspaceSystem(): void {
    wireWorkspaceSystem(this.getWorkspaceAreaWiringHost());
  }

  /** Rebuilds workspace switcher tabs from the store. */
  protected refreshWorkspaceSwitcher(): void {
    refreshWorkspaceSwitcherBar(this.getWorkspaceAreaWiringHost());
  }

  /**
   * Wires splitters and corner gestures after the registry exists so structural
   * mutations can create and dispose panes safely.
   */
  protected bindAreaLayoutInteraction(): void {
    wireAreaLayoutInteraction(this.getWorkspaceAreaWiringHost());
  }

  /**
   * Builds the host bag for workspace and area tiling wiring helpers.
   *
   * @returns Workspace/area wiring host.
   */
  protected getWorkspaceAreaWiringHost(): WorkspaceAreaWiringHost {
    return buildWorkspaceAreaWiringHost(this.toLayoutCoreHostSource());
  }

  /**
   * Rebinds shared scene objects, tools, and chrome after area structure
   * changes (split, join, workspace switch).
   */
  protected rewireAfterAreaStructureChange(): void {
    this.sceneBootstrap.rewireAfterViewportMutation(
      this.worldObject,
      this.viewportRegistry,
      this.sharedWorldScene,
      this.viewportSyncManager,
      this.transformGizmo,
    );
    this.selectionVisualController?.wireViewports(this.getAllLiveViewports());
    this.transformInteractionBridge?.setViewportProbe((clientX, clientY) =>
      this.findInteractiveViewportAtClientPointForTools(
        clientX,
        clientY,
        this.toolEditorSystem?.editorWindow.lastPointerOwnerDocument ?? null,
      ),
    );
    this.toolEditorSystem?.refreshInteractiveViewportDomain();
    this.shadingModeCoordinator?.rebindViewportUi();
    this.attachCadRulers();
    this.watchResize();
    this.resizeAll();
  }

  /**
   * Finds an interactive viewport under a client point for tool/gizmo probes.
   * Client coordinates are window-local; when ownerDocument is set only panes
   * in that document are considered.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @param ownerDocument Optional document that owns the client coordinates.
   * @returns Viewport, or null.
   */
  private findInteractiveViewportAtClientPointForTools(
    clientX: number,
    clientY: number,
    ownerDocument: Document | null = null,
  ):
    import('@/viewports/core/viewport_3d.js').Viewport3D | import('@/viewports/core/viewport_2d.js').Viewport2D | null {
    for (const viewport of this.getAllInteractiveViewports()) {
      const pickElement = viewport.getContentElement();
      if (!pickElement) {
        continue;
      }
      if (ownerDocument && pickElement.ownerDocument !== ownerDocument) {
        continue;
      }
      const rect = pickElement.getBoundingClientRect();
      if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
        continue;
      }
      return viewport as
        import('@/viewports/core/viewport_3d.js').Viewport3D | import('@/viewports/core/viewport_2d.js').Viewport2D;
    }
    return null;
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
      this.viewportPresentationContext,
      () => this.settingsStore?.getViewSettings().cameraWidgetSizePx ?? CAMERA_WIDGET_SIZE_DEFAULT_PX,
    );
    this.viewportRegistry = bootstrapped.registry;
    this.refreshNamedViewportFields();
    this.viewportSyncManager = new ManagerViewportSync(
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
  protected wireDetachedViewport(viewport: ViewportEditor): void {
    attachDetachedViewport(this.getDetachedViewportHost(), viewport);
    this.toolEditorSystem?.refreshInteractiveViewportDomain();
  }

  /**
   * Handles teardown notification for a disposed detached viewport instance.
   *
   * @param _viewport Viewport that is no longer live.
   */
  protected onDetachedViewportDisposed(_viewport: ViewportEditor): void {
    handleDetachedViewportDisposed(this.getDetachedViewportHost());
    this.toolEditorSystem?.refreshInteractiveViewportDomain();
  }

  /**
   * Applies screen-space bounds grip sizing for a detached pane pass.
   *
   * @param viewport Detached viewport being prepared.
   */
  protected prepareDetachedGizmoBoundsScreenSpace(viewport: ViewportEditor): void {
    const group = viewport.getGizmoGroup();
    if (!group) return;
    const camera = viewport.getCamera();
    const content = viewport.getContentElement();
    const height = Math.max(1, content.clientHeight || content.offsetHeight || 512);
    const viewPlane = getCadViewPlaneForKind(viewport.getViewportKind());
    this.transformGizmo.prepareTransformCloneForCamera(group, camera);
    this.transformGizmo.prepareBoundsCloneForCamera(group, camera, viewPlane, height);
  }

  /**
   * Builds the detached-viewport host bag for multi-monitor wiring.
   *
   * @returns Detached viewport host.
   */
  protected getDetachedViewportHost() {
    return buildDetachedViewportHost(this.toLayoutCoreHostSource());
  }

  /**
   * Returns main-window viewports plus any open detached panes for tools that
   * must reach every interactive surface (selection, face mode, transforms).
   *
   * @returns Combined live viewport list.
   */
  protected getAllInteractiveViewports(): ViewportEditor[] {
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
   * Returns live viewports currently considered active for render and input, in
   * multi-view draw order (orthographic first, then perspective).
   *
   * @returns Active editor viewports.
   */
  protected getActiveViewports(): readonly ViewportEditor[] {
    return this.viewportRegistry.getActiveViewports();
  }

  /**
   * Returns every live viewport instance regardless of active flag.
   *
   * @returns All viewport instances.
   */
  protected getAllLiveViewports(): ViewportEditor[] {
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

  /** Rebuilds CAD size dimensions for the current selection (or clears them). */
  protected refreshCadRulersFromSelection(): void {
    rebuildCadRulersFromSelection(this.getCadRulerHost());
  }

  /** Attaches CAD ruler overlays to every interactive viewport. */
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
    this.sceneIOHandler = new HandlerSceneIo();
    this.setupCameraAndShadingCoordinators();
    this.setupFaceModeCoordinator();
    this.setupUvEditor();
    this.setupTextureBrowser();
    this.setupToolsPaletteAndClip();
    this.setupSolidModelPanel();
    this.setupAiBridge();
    this.setupSnapSettingsController();
    this.installToolEditorFocusSystem();
  }

  /**
   * Registers floating tool windows and installs capture-phase focus routing
   * (Shape Editor active event receiver + busy exclusivity for GUI).
   */
  protected installToolEditorFocusSystem(): void {
    if (!this.toolEditorSystem) {
      return;
    }
    this.registerToolEditorGuiSurface(this.toolsPalette, 'tools_palette');
    this.registerToolEditorGuiSurface(this.uvEditor, 'uv_editor');
    this.registerToolEditorGuiSurface(this.textureBrowser, 'texture_browser');
    this.registerToolEditorGuiSurface(this.solidModelPanel, 'solid_model_panel');
    this.toolEditorSystem.installFocusPointerRouter(this.toolbarContainer);
  }

  /**
   * Registers a floating panel root with the tool focus manager.
   *
   * @param panel Panel exposing a root element, or null when not built.
   * @param surfaceId Stable surface id for the focus registry.
   */
  protected registerToolEditorGuiSurface(
    panel: { getRootElement(): HTMLElement } | null | undefined,
    surfaceId: string,
  ): void {
    if (!panel || !this.toolEditorSystem) {
      return;
    }
    this.toolEditorSystem.registerGuiSurface(panel.getRootElement(), surfaceId);
  }

  /** Creates selection visuals and primitive creation wiring. */
  protected createSelectionAndPrimitiveHandlers(): void {
    this.selectionVisualController = new ControllerSelectionVisual(this.selectionManager, this.viewportSyncManager);
    this.primitiveCreationHandler = new HandlerPrimitiveCreation(
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
    return (
      this.getActiveViewports()[0]?.getCamera() ??
      this.viewport3D?.getCamera() ??
      this.getAllLiveViewports()[0]!.getCamera()
    );
  }

  /** Creates object, CSG, and alignment action handlers. */
  protected createActionHandlers(): void {
    const handlers = createWiredActionHandlers(
      this.worldObject,
      this.commandStack,
      this.selectionManager,
      this.gridSnap,
      {
        syncViewports: () => this.refreshAfterWorldMutation(),
        afterTransformCommit: (objects) => this.refreshVisualsAfterTransformCommit(objects),
        refreshOutliner: () => this.refreshOutliner(),
        mirrorExpandState: (sourceRoot, cloneRoot) =>
          this.outlinerPanel.copyExpandStateFromSource(sourceRoot, cloneRoot),
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
      getDetachedViewports: () => this.detachedViewportWindow.getViewports(),
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
  protected wireClipCallbackOnViewport(viewport: ViewportEditor): void {
    bindClipCallbackOnViewport(this.getViewportChromeHost(), viewport);
  }

  /**
   * Builds the chrome host bag for maximize, type menu, and clip wiring.
   *
   * @returns Viewport chrome host.
   */
  protected getViewportChromeHost() {
    return buildViewportChromeHost(this.toLayoutCoreHostSource());
  }

  /**
   * Builds the CAD ruler host bag for selection and transform feedback.
   *
   * @returns CAD ruler host.
   */
  protected getCadRulerHost() {
    return buildCadRulerHost(this.toLayoutCoreHostSource());
  }

  /**
   * Adapts this layout core instance into the host-builder field source.
   *
   * @returns Layout core host source.
   */
  private toLayoutCoreHostSource(): LayoutCoreHostSource {
    return {
      toolbarContainer: this.toolbarContainer,
      viewportArea: this.viewportArea,
      viewportPaneGrid: this.viewportPaneGrid,
      workspaceStore: this.workspaceStore,
      workspaceController: this.workspaceController,
      workspaceSwitcherBar: this.workspaceSwitcherBar,
      areaLayoutInteraction: this.areaLayoutInteraction,
      viewportRegistry: this.viewportRegistry,
      viewportPaneLayout: this.viewportPaneLayout,
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
      cadRulerSystem: this.cadRulerSystem,
      rulerBoundsBuilder: this.rulerBoundsBuilder,
      transformHandler: this.transformHandler,
      selectionManager: this.selectionManager,
      statusBar: this.statusBar,
      editorOverlayPolicy: this.editorOverlayPolicy,
      viewportPresentationContext: this.viewportPresentationContext,
      getCameraWidgetSizePx: () =>
        this.settingsStore?.getViewSettings().cameraWidgetSizePx ?? CAMERA_WIDGET_SIZE_DEFAULT_PX,
      setWorkspaceController: (controller) => {
        this.workspaceController = controller;
      },
      setWorkspaceSwitcherBar: (bar) => {
        this.workspaceSwitcherBar = bar;
      },
      setAreaLayoutInteraction: (interaction) => {
        this.areaLayoutInteraction = interaction;
      },
      getViewportChromeHost: () => this.getViewportChromeHost(),
      resizeAll: () => this.resizeAll(),
      refreshNamedViewportFields: () => this.refreshNamedViewportFields(),
      rewireAfterAreaStructureChange: () => this.rewireAfterAreaStructureChange(),
      getPrimaryPerspectiveViewport: () => this.getPrimaryPerspectiveViewport(),
      wireClipCallbackOnViewport: (viewport) => this.wireClipCallbackOnViewport(viewport),
      updateGizmoVisibility: () => this.updateGizmoVisibility(),
      attachCadRulers: () => this.attachCadRulers(),
      showStatusMessage: (message) => this.showStatusMessage(message),
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
      editorOverlayPolicy: this.editorOverlayPolicy,
      modalToolSessionRegistry: this.modalToolSessionRegistry,
      isEditorToolBusy: () => this.toolEditorSystem?.isActiveEventReceiverBusy() === true,
      switchToClipTool: () => this.toolEditorSystem?.switchToClipTool() === true,
      switchToObjectSelect: () => {
        this.toolEditorSystem?.switchToObjectSelect();
      },
      switchToFaceSelect: () => {
        this.toolEditorSystem?.switchToFaceSelect();
      },
      registerClipTool: (placement, handler) => {
        this.toolEditorSystem?.registerClipTool(placement, handler);
      },
    });
    this.clipPlaneHandler = result.clipPlaneHandler;
    this.toolsPalette = result.toolsPalette;
    this.toolsPaletteController = result.toolsPaletteController;
    this.renderLoop.setClipPlaneHandler(result.clipPlaneHandler);
    this.editorOverlayPolicy.addChangeListener(() => this.refreshCadRulersFromSelection());
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
      unlockedSelected.length > 0 &&
        !this.isFaceSelectionModeActive() &&
        !this.isClipPlaneToolActive() &&
        !this.transformHandler.isSingleUseDrag(),
    );
  }

  /**
   * Cancels single-use tools first (Shape Editor Escape), then clears selection
   * and returns to object select.
   */
  protected onEscapeCancel(): void {
    if (this.toolEditorSystem?.cancelActiveSingleUseTool()) {
      this.statusBar?.setLastAction('Tool cancelled');
      return;
    }
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
      revealOutlinerObject: (object) => this.outlinerPanel.revealObject(object),
      showStatusMessage: (message) => this.showStatusMessage(message),
    });
    this.solidModelPanel = setup.solidModelPanel;
    this.solidModelController = setup.solidModelController;
    this.solidModelController.setTransformModeProvider(() => this.transformHandler.getMode());
    this.solidModelController.setActiveCameraProvider(() => this.getActiveSpawnCamera());
    this.solidModelController.adoptFirstSolidModelInWorld();
  }

  /** Binds the EditorApi facade used by the desktop MCP host. */
  protected setupAiBridge(): void {
    setupLayoutAi({
      worldObject: this.worldObject,
      commandStack: this.commandStack,
      selectionManager: this.selectionManager,
      solidModelController: this.solidModelController,
      gridSnap: this.gridSnap,
      snapManager: this.snapManager,
      getUserSnapEnabled: () => this.userSnapEnabled,
      refreshAfterWorldMutation: () => this.refreshAfterWorldMutation(),
      refreshOutliner: () => this.refreshOutliner(),
      showStatusMessage: (message) => this.showStatusMessage(message),
    });
  }

  /** Opens the MCP connection dialog from the main toolbar. */
  protected onOpenMcpDialog(): void {
    openLayoutMcpDialog(this.container, this.toolbar, this.statusBar, (message) => this.showStatusMessage(message));
  }

  /**
   * Queries desktop MCP host status and glows the toolbar MCP button when the
   * server is running.
   */
  protected async refreshMcpToolbarButton(): Promise<void> {
    await refreshLayoutMcpToolbarButton(this.toolbar);
  }

  /**
   * Highlights the main toolbar MCP control when the host is running.
   *
   * @param running Whether the MCP server is active.
   */
  protected setMcpToolbarButtonActive(running: boolean): void {
    setLayoutMcpToolbarButtonActive(this.toolbar, running);
  }

  /** Toggles the solid model floating panel. */
  protected onToggleSolidModelPanel(): void {
    toggleLayoutSolidModelPanel(this.solidModelController, this.solidModelPanel, this.statusBar);
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
    openLayoutDetachedViewport(
      () => this.bindDetachedViewportRenderSource(),
      this.detachedViewportWindow,
      (message) => this.showStatusMessage(message),
    );
  }

  /** Opens the hosted user documentation in a separate browser tab. */
  protected onOpenDocumentation(): void {
    openLayoutDocumentation(this.statusBar);
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
      getPerspectiveViewport: () => this.getPrimaryPerspectiveViewport(),
      getRendererHost: () =>
        this.getPrimaryPerspectiveViewport() ??
        this.getAllLiveViewports()[0] ??
        this.getAllInteractiveViewports()[0] ??
        null,
      viewportPaneLayout: this.viewportPaneLayout,
      toolbar: this.toolbar,
      resizeAll: () => this.resizeAll(),
      ...(this.settingsStore ? { settingsStore: this.settingsStore } : {}),
      presentationContext: this.viewportPresentationContext,
      getViewports: () => this.getAllInteractiveViewports(),
      onProfileChanged: () => {
        this.cadRulerSystem.setPresentationUnits(
          this.viewportPresentationContext.toProfileUnits(1),
          this.viewportPresentationContext.getUnitLabel(),
        );
        this.attachCadRulers();
        this.resizeAll();
      },
      onVisibleSlots: (slots) => this.syncActivePanesFromSlots(slots),
      onViewportPaneCount: (paneCount) => {
        this.workspaceController?.applyPaneCountMigration(paneCount);
        this.refreshWorkspaceSwitcher();
      },
    });
    this.settingsStore = parts.settingsStore;
    this.settingsApplicator = parts.settingsApplicator;
    this.settingsDialog = parts.settingsDialog;
    this.settingsUnsubscribe = parts.settingsUnsubscribe;
  }

  /** Creates and initializes the snap settings controller. */
  protected setupSnapSettingsController(): void {
    this.snapSettingsController = createLayoutSnapSettingsController({
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
  }

  /** @returns Outliner action callback bundle for the shell builder. */
  protected abstract createOutlinerActions(): import('@/layout/shell/builder_editor_shell.js').EditorShellOutlinerActions;

  /** @returns Toolbar action callback bundle for the shell builder. */
  protected abstract createToolbarShellActionsBundle(): import('@/layout/shell/builder_editor_shell.js').EditorToolbarActions;

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

  /** Pose-commit refresh (solid finalize once + clones) after transform writes. */
  protected abstract refreshVisualsAfterTransformCommit(transformedObjects: readonly THREE.Object3D[]): void;

  /** @param message Status bar message text. */
  protected abstract showStatusMessage(message: string): void;

  /** @param axis Active alignment axis restriction. */
  protected abstract onAxisRestrictionChanged(axis: AlignmentAxis): void;

  /** Resizes the shared surface and every active pane camera. */
  protected abstract resizeAll(): void;

  /** Updates the gizmo pivot to the selection center. */
  protected abstract updateGizmoPivot(): void;

  /** @param mode Transform mode to activate. */
  protected abstract onTransformMode(mode: TransformMode): void;

  /** Toggles the UV editor panel. */
  protected abstract onToggleUvEditor(): void;

  /** @returns True when face selection mode is active. */
  protected abstract isFaceSelectionModeActive(): boolean;

  /** @returns True when the clip plane tool is active. */
  protected abstract isClipPlaneToolActive(): boolean;
}
