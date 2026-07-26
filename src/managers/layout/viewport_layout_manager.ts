import * as THREE from 'three';
import { InputManager } from '../input/input_manager.js';
import { Viewport3D } from '../../viewports/viewport_3d.js';
import { Viewport2D } from '../../viewports/viewport_2d.js';
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
import { TransformMode } from '../../types/transform_mode.js';
import { SelectionMode } from '../../types/selection_mode.js';
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
import { CreateTerrainCommand } from '../../commands/create/create_terrain_command.js';
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
import { applyTransformModeUi } from './layout_transform_mode_ui.js';
import {
  createOutlinerShellActions,
  createToolbarShellActions,
  mergeLayoutShellActionSourceParts,
  type LayoutShellActionSource,
} from './layout_shell_action_builders.js';
import { setupUvEditorPanel } from './layout_uv_editor_setup.js';
import { setupTextureBrowserPanel } from './layout_texture_browser_setup.js';
import { createWiredActionHandlers } from './layout_action_handler_factory.js';
import { createAndRegisterKeyboardShortcuts } from './layout_keyboard_bindings.js';
import { SolidModelPanel } from '../../ui/solid_model_panel.js';
import { SolidModelController } from '../solid/solid_model_controller.js';
import { setupSolidModelLayout } from './layout_solid_model_setup.js';
import { buildLayoutTestComponents } from './layout_testing_accessors.js';
import { disposeLayoutOwnedResources } from './layout_dispose_helpers.js';
import {
  setupCameraAndShadingCoordinators as createCameraAndShadingCoordinators,
  setupFaceModeCoordinator as createFaceModeCoordinator,
  setupToolsPaletteAndClipWiring as createToolsPaletteAndClip,
  cancelClipToolSelection,
} from './layout_coordinator_setup.js';
import { LayoutRenderLoop } from './layout_render_loop.js';
import { TransformSpace } from '../../types/transform_space.js';
import { ViewportPaneLayout } from './viewport_pane_layout.js';
import {
  applyLayoutTransformSpace,
  updateLayoutGizmoCameraScale,
  updateLayoutGizmoPivot,
  type LayoutGizmoContext,
} from './layout_gizmo_helpers.js';
import {
  applyLayoutHistoryChange,
  handleLayoutSceneLoaded,
  runLayoutExportGlb,
  runLayoutVmfImport,
} from './layout_scene_io_actions.js';
import { createLayoutSettingsSystem, openLayoutAboutDialog } from './layout_settings_system.js';
import { DocumentationLink } from '../../ui/documentation_link.js';
import { CadRulerSystem } from '../../rulers/cad_ruler_system.js';
import { OrientedBoundsBuilder } from '../../transform/bounds/oriented_bounds.js';

/**
 * Root composition manager for the four-viewport editor layout. Builds UI
 * shell, viewports, and wires specialized coordinators.
 */
export class ViewportLayoutManager {
  private container: HTMLElement;
  private viewports!: HTMLElement[];
  private viewportArea!: HTMLElement;
  private viewportPaneLayout!: ViewportPaneLayout;
  private viewport3D!: Viewport3D;
  private viewport2DTop!: Viewport2D;
  private viewport2DFront!: Viewport2D;
  private viewport2DSide!: Viewport2D;
  private inputManager!: InputManager;
  private worldObject!: THREE.Group;
  private isDisposed: boolean;
  private readonly renderLoop: LayoutRenderLoop;
  private selectionManager!: SelectionManager;
  private selectionVisualController!: SelectionVisualController;
  private hierarchyReparentHandler!: HierarchyReparentHandler;
  private primitiveTool!: PrimitiveCreationTool;
  private toolbar!: Toolbar;
  private outlinerPanel!: OutlinerPanel;
  private propertiesPanel!: PropertiesPanel;
  private toolbarContainer!: HTMLElement;
  private transformGizmo!: TransformGizmo;
  private gizmoRaycaster!: GizmoRaycaster;
  private transformExecutor!: TransformExecutor;
  private transformHandler!: TransformHandler;
  private gridSnap!: GridSnap;
  private userSnapEnabled!: boolean;
  private transformSpace!: TransformSpace;
  private snapManager!: SnapManager;
  private commandStack!: CommandStack;
  private statusBar!: StatusBar | null;
  private viewportSyncManager!: ViewportSyncManager;
  private primitiveCreationHandler!: PrimitiveCreationHandler;
  private keyboardShortcutHandler!: KeyboardShortcutHandler;
  private objectActionHandler!: ObjectActionHandler;
  private alignmentHandler!: AlignmentHandler;
  private sceneIOHandler!: SceneIOHandler;
  private faceModeCoordinator!: FaceModeCoordinator;
  private snapSettingsController!: SnapSettingsController;
  private cameraFitCoordinator!: CameraFitCoordinator;
  private shadingModeCoordinator!: ShadingModeCoordinator;
  private transformInteractionBridge!: TransformInteractionBridge;
  private csgActionHandler!: CsgActionHandler;
  private terrainGenerator!: TerrainGenerator;
  private uvEditor!: UvEditor | null;
  private uvEditorController!: UvEditorController | null;
  private textureBrowser!: TextureBrowser | null;
  private textureBrowserController!: TextureBrowserController | null;
  private textureAssignmentController!: TextureAssignmentController | null;
  private textureLock!: TextureLockSettings;
  private toolsPalette!: ToolsPalette | null;
  private toolsPaletteController!: ToolsPaletteController | null;
  private aboutDialog!: AboutDialog | null;
  private settingsDialog!: SettingsDialog | null;
  private settingsStore!: EditorSettingsStore | null;
  private settingsApplicator!: SettingsApplicator | null;
  private settingsUnsubscribe!: (() => void) | null;
  private clipPlaneTool!: ClipPlaneTool;
  private clipPlaneHandler!: ClipPlaneHandler | null;
  private solidModelPanel!: SolidModelPanel | null;
  private solidModelController!: SolidModelController | null;
  private cadRulerSystem!: CadRulerSystem;
  private rulerBoundsBuilder!: OrientedBoundsBuilder;

  /**
   * Creates the viewport layout with toolbar, outliner, and four viewports.
   *
   * @param editorContainer The root DOM element for the editor UI.
   */
  constructor(editorContainer: HTMLElement) {
    this.container = editorContainer;
    this.isDisposed = false;
    this.renderLoop = new LayoutRenderLoop();
    this.initializeCoreSystems();
    this.buildShellAndViewports();
    this.wireHandlersAndCoordinators();
    this.bindRenderLoop();
    this.watchResize();
  }

  /** Assigns core managers that do not depend on DOM layout. */
  private initializeCoreSystems(): void {
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
  private buildShellAndViewports(): void {
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
      this.createToolbarActions(),
    );
    this.toolbarContainer = shell.toolbarContainer;
    this.viewportArea = shell.viewportArea;
    this.viewports = shell.viewports;
    this.viewportPaneLayout = new ViewportPaneLayout(this.viewportArea, this.viewports);
    this.toolbar = shell.toolbar;
    this.outlinerPanel = shell.outlinerPanel;
    this.propertiesPanel = shell.propertiesPanel;
    this.statusBar = shell.statusBar;
    this.assignViewportsFromBootstrap();
    this.syncPrimitivesToViewports();
    this.updateTransformButtons();
  }

  /** Creates viewports, sync manager, and shared scene objects. */
  private assignViewportsFromBootstrap(): void {
    const bootstrap = new ViewportSceneBootstrap();
    const viewports = bootstrap.createViewports(this.viewports, this.inputManager);
    this.viewport2DTop = viewports.viewport2DTop;
    this.viewport2DFront = viewports.viewport2DFront;
    this.viewport2DSide = viewports.viewport2DSide;
    this.viewport3D = viewports.viewport3D;
    this.viewportSyncManager = new ViewportSyncManager(
      this.viewport2DTop,
      this.viewport2DFront,
      this.viewport2DSide,
      this.viewport3D,
    );
    bootstrap.addSharedObjects(this.worldObject, viewports, this.viewportSyncManager, this.transformGizmo);
    this.attachCadRulers();
  }

  /** Attaches CAD ruler overlays to every viewport scene and container. */
  private attachCadRulers(): void {
    this.cadRulerSystem.attachViewports([
      {
        scene: this.viewport2DTop.getScene(),
        camera: this.viewport2DTop.getCamera(),
        renderer: this.viewport2DTop.getRenderer(),
        container: this.viewports[0]!,
        viewPlane: 'xz',
      },
      {
        scene: this.viewport2DFront.getScene(),
        camera: this.viewport2DFront.getCamera(),
        renderer: this.viewport2DFront.getRenderer(),
        container: this.viewports[1]!,
        viewPlane: 'xy',
      },
      {
        scene: this.viewport2DSide.getScene(),
        camera: this.viewport2DSide.getCamera(),
        renderer: this.viewport2DSide.getRenderer(),
        container: this.viewports[2]!,
        viewPlane: 'yz',
      },
      {
        scene: this.viewport3D.getScene(),
        camera: this.viewport3D.getCamera(),
        renderer: this.viewport3D.getRenderer(),
        container: this.viewports[3]!,
        viewPlane: 'xyz',
      },
    ]);
  }

  /** Wires specialized handlers after viewports and shell exist. */
  private wireHandlersAndCoordinators(): void {
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
  private createSelectionAndPrimitiveHandlers(): void {
    this.selectionVisualController = new SelectionVisualController(this.selectionManager, this.viewportSyncManager);
    this.primitiveCreationHandler = new PrimitiveCreationHandler(
      this.primitiveTool,
      this.worldObject,
      this.commandStack,
      this.selectionManager,
    );
    this.primitiveCreationHandler.setOnPrimitiveCreated(() => this.onPrimitiveCreated());
  }

  /** Creates object, CSG, and alignment action handlers. */
  private createActionHandlers(): void {
    const handlers = createWiredActionHandlers(
      this.worldObject,
      this.commandStack,
      this.selectionManager,
      this.gridSnap,
      {
        syncViewports: () => this.syncPrimitivesToViewports(),
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
  private setupCameraAndShadingCoordinators(): void {
    const setup = createCameraAndShadingCoordinators({
      selectionManager: this.selectionManager,
      statusBar: this.statusBar,
      keyboardShortcutHandler: this.keyboardShortcutHandler,
      viewport2DTop: this.viewport2DTop,
      viewport2DFront: this.viewport2DFront,
      viewport2DSide: this.viewport2DSide,
      viewport3D: this.viewport3D,
      viewports: this.viewports,
      selectionVisualController: this.selectionVisualController,
    });
    this.cameraFitCoordinator = setup.cameraFitCoordinator;
    this.shadingModeCoordinator = setup.shadingModeCoordinator;
  }

  /** Creates the face selection/extrusion coordinator. */
  private setupFaceModeCoordinator(): void {
    this.faceModeCoordinator = createFaceModeCoordinator({
      viewport3D: this.viewport3D,
      viewport2DTop: this.viewport2DTop,
      viewport2DFront: this.viewport2DFront,
      viewport2DSide: this.viewport2DSide,
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
  private setupToolsPaletteAndClip(): void {
    const result = createToolsPaletteAndClip({
      worldObject: this.worldObject,
      commandStack: this.commandStack,
      selectionManager: this.selectionManager,
      gridSnap: this.gridSnap,
      clipPlaneTool: this.clipPlaneTool,
      faceModeCoordinator: this.faceModeCoordinator,
      toolbarContainer: this.toolbarContainer,
      anchorViewport: this.viewports[3]!,
      viewport3D: this.viewport3D,
      viewport2DTop: this.viewport2DTop,
      viewport2DFront: this.viewport2DFront,
      viewport2DSide: this.viewport2DSide,
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
  private onClipCancel(): void {
    cancelClipToolSelection(this.clipPlaneHandler, this.toolsPaletteController);
  }

  /** Refreshes palette context and hides transform gizmos while clipping. */
  private onClipToolStateChanged(): void {
    this.toolsPaletteController?.refreshPaletteContext();
    this.updateGizmoVisibility();
  }

  /** Shows or hides transform/bounds gizmos based on selection and active tools. */
  private updateGizmoVisibility(): void {
    const selected = this.selectionManager.getAllSelectedObjectsAsArray();
    const unlockedSelected = filterUnlockedObjects(selected);
    this.transformGizmo.setVisible(
      unlockedSelected.length > 0 && !this.isFaceSelectionModeActive() && !this.isClipPlaneToolActive(),
    );
  }

  /** Clears selection, cancels active tools, and returns to object select. */
  private onEscapeCancel(): void {
    this.clipPlaneHandler?.cancel();
    this.toolsPaletteController?.selectTool(EditorToolId.OBJECT);
    this.faceModeCoordinator?.getFaceExtrusionController().clearFaceSelection();
    this.selectionManager.clearSelection();
    this.statusBar?.setLastAction('Selection cleared');
  }

  /** Toggles the floating Tools palette. */
  private onToggleToolsPalette(): void {
    this.toolsPalette?.toggle();
    if (this.toolsPalette?.isOpen()) {
      this.statusBar?.setLastAction('Tools palette opened');
    }
  }

  /** Creates the solid model floating panel and controller. */
  private setupSolidModelPanel(): void {
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
    // Startup seeds a solid model before this panel exists; claim it as active.
    this.solidModelController.adoptFirstSolidModelInWorld();
  }

  /** Toggles the solid model floating panel. */
  private onToggleSolidModelPanel(): void {
    this.solidModelController?.togglePanel();
    if (this.solidModelPanel?.isOpen()) {
      this.statusBar?.setLastAction('Solid Model panel opened');
    }
  }

  /** Creates a solid model with a default box brush. */
  private onAddSolidModel(): void {
    this.solidModelController?.createSolidModel();
  }

  /** Opens the About dialog, creating it on first use. */
  private onOpenAboutDialog(): void {
    this.aboutDialog = openLayoutAboutDialog(this.container, this.aboutDialog, this.statusBar);
  }

  /** Opens the hosted user documentation in a separate browser tab. */
  private onOpenDocumentation(): void {
    new DocumentationLink().open();
    this.statusBar?.setLastAction('Documentation opened');
  }

  /** Toggles the Settings dialog, creating store and dialog on first use. */
  private onToggleSettingsDialog(): void {
    this.ensureSettingsSystem();
    this.settingsDialog?.toggle();
    if (this.settingsDialog?.isOpen()) {
      this.statusBar?.setLastAction('Settings opened');
      return;
    }
    this.statusBar?.setLastAction('Settings closed');
  }

  /** Lazily creates the settings store, applicator, and dialog. */
  private ensureSettingsSystem(): void {
    if (this.settingsStore && this.settingsDialog) {
      return;
    }
    const parts = createLayoutSettingsSystem({
      container: this.container,
      viewport3D: this.viewport3D,
      viewportPaneLayout: this.viewportPaneLayout,
      resizeAll: () => this.resizeAll(),
    });
    this.settingsStore = parts.settingsStore;
    this.settingsApplicator = parts.settingsApplicator;
    this.settingsDialog = parts.settingsDialog;
    this.settingsUnsubscribe = parts.settingsUnsubscribe;
  }

  /** Creates and initializes the snap settings controller. */
  private setupSnapSettingsController(): void {
    this.snapSettingsController = new SnapSettingsController({
      gridSnap: this.gridSnap,
      snapManager: this.snapManager,
      textureLock: this.textureLock,
      toolbar: this.toolbar,
      statusBar: this.statusBar,
      keyboardShortcutHandler: this.keyboardShortcutHandler,
      worldObject: this.worldObject,
      viewport2DTop: this.viewport2DTop,
      viewport2DFront: this.viewport2DFront,
      viewport2DSide: this.viewport2DSide,
      viewport3D: this.viewport3D,
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
  private createOutlinerActions() {
    return createOutlinerShellActions(this.buildShellActionSource());
  }

  /**
   * Builds toolbar action callbacks for the shell builder.
   *
   * @returns Toolbar action callback bundle.
   */
  private createToolbarActions() {
    return createToolbarShellActions(this.buildShellActionSource());
  }

  /**
   * Builds a late-bound shell action source so handlers may be wired after the
   * shell. Merges property descriptors so getters stay live (object spread
   * would snapshot undefined handlers at shell-build time).
   *
   * @returns Layout shell action surface.
   */
  private buildShellActionSource(): LayoutShellActionSource {
    return mergeLayoutShellActionSourceParts(
      this.buildShellCoreFields(),
      this.buildShellHandlerFields(),
      this.buildShellPanelCallbacks(),
      this.buildShellEditCallbacks(),
      this.buildShellIoCallbacks(),
    );
  }

  /**
   * Late-bound core manager fields for shell actions.
   *
   * @returns Core field getters.
   */
  private buildShellCoreFields(): Pick<
    LayoutShellActionSource,
    | 'selectionManager'
    | 'commandStack'
    | 'hierarchyReparentHandler'
    | 'outlinerPanel'
    | 'textureLock'
    | 'userSnapEnabled'
  > {
    const layout = this;
    return {
      get selectionManager() {
        return layout.selectionManager;
      },
      get commandStack() {
        return layout.commandStack;
      },
      get hierarchyReparentHandler() {
        return layout.hierarchyReparentHandler;
      },
      get outlinerPanel() {
        return layout.outlinerPanel;
      },
      get textureLock() {
        return layout.textureLock;
      },
      get userSnapEnabled() {
        return layout.userSnapEnabled;
      },
    };
  }

  /**
   * Late-bound action handler fields for shell actions.
   *
   * @returns Handler field getters.
   */
  private buildShellHandlerFields(): Pick<
    LayoutShellActionSource,
    | 'objectActionHandler'
    | 'primitiveCreationHandler'
    | 'csgActionHandler'
    | 'alignmentHandler'
    | 'snapSettingsController'
  > {
    const layout = this;
    return {
      get objectActionHandler() {
        return layout.objectActionHandler;
      },
      get primitiveCreationHandler() {
        return layout.primitiveCreationHandler;
      },
      get csgActionHandler() {
        return layout.csgActionHandler;
      },
      get alignmentHandler() {
        return layout.alignmentHandler;
      },
      get snapSettingsController() {
        return layout.snapSettingsController;
      },
    };
  }

  /**
   * Panel/toggle callbacks for shell actions.
   *
   * @returns Panel-related callbacks.
   */
  private buildShellPanelCallbacks(): Pick<
    LayoutShellActionSource,
    | 'refreshOutliner'
    | 'syncPrimitivesToViewports'
    | 'showStatusMessage'
    | 'onSelectionChanged'
    | 'onToggleUvEditor'
    | 'onToggleTextureBrowser'
    | 'onToggleToolsPalette'
    | 'onToggleSolidModelPanel'
    | 'onToggleSettingsDialog'
    | 'onOpenDocumentation'
    | 'onOpenAboutDialog'
  > {
    return {
      refreshOutliner: () => this.refreshOutliner(),
      syncPrimitivesToViewports: () => this.syncPrimitivesToViewports(),
      showStatusMessage: (message) => this.showStatusMessage(message),
      onSelectionChanged: () => this.onSelectionChanged(),
      onToggleUvEditor: () => this.onToggleUvEditor(),
      onToggleTextureBrowser: () => this.onToggleTextureBrowser(),
      onToggleToolsPalette: () => this.onToggleToolsPalette(),
      onToggleSolidModelPanel: () => this.onToggleSolidModelPanel(),
      onToggleSettingsDialog: () => this.onToggleSettingsDialog(),
      onOpenDocumentation: () => this.onOpenDocumentation(),
      onOpenAboutDialog: () => this.onOpenAboutDialog(),
    };
  }

  /**
   * Edit/history/create callbacks for shell actions.
   *
   * @returns Edit-related callbacks.
   */
  private buildShellEditCallbacks(): Pick<
    LayoutShellActionSource,
    | 'onAddTerrain'
    | 'onAddSolidModel'
    | 'onUndo'
    | 'onRedo'
    | 'onDeleteSelected'
    | 'onGroupSelected'
    | 'onSetTransformSpaceGlobal'
    | 'onSetTransformSpaceLocal'
    | 'isTransformSpaceLocal'
  > {
    return {
      onAddTerrain: () => this.onAddTerrain(),
      onAddSolidModel: () => this.onAddSolidModel(),
      onUndo: () => this.onUndo(),
      onRedo: () => this.onRedo(),
      onDeleteSelected: () => this.onDeleteSelected(),
      onGroupSelected: () => this.onGroupSelected(),
      onSetTransformSpaceGlobal: () => this.onSetTransformSpaceGlobal(),
      onSetTransformSpaceLocal: () => this.onSetTransformSpaceLocal(),
      isTransformSpaceLocal: () => this.isTransformSpaceLocal(),
    };
  }

  /**
   * Scene I/O callbacks for shell actions.
   *
   * @returns Save/load/import/export callbacks.
   */
  private buildShellIoCallbacks(): Pick<
    LayoutShellActionSource,
    'onSaveScene' | 'onLoadScene' | 'onImportVmf' | 'onExportGlb'
  > {
    return {
      onSaveScene: () => this.onSaveScene(),
      onLoadScene: () => this.onLoadScene(),
      onImportVmf: () => this.onImportVmf(),
      onExportGlb: () => this.onExportGlb(),
    };
  }

  /** Handles deletion of selected objects, preferring outliner hierarchy roots. */
  private onDeleteSelected(): void {
    const hierarchyObjects = this.outlinerPanel.getObjectsForGrouping();
    if (hierarchyObjects.length > 0) {
      this.objectActionHandler.deleteHierarchyObjects(hierarchyObjects);
      return;
    }
    this.objectActionHandler.onDeleteSelected();
  }

  /** Groups objects selected in the outliner hierarchy. */
  private onGroupSelected(): void {
    const objects = this.outlinerPanel.getObjectsForGrouping();
    if (objects.length === 0) return;
    this.objectActionHandler.groupObjects(objects);
  }

  /** Wires selection state, outlines, and gizmo visibility across viewports. */
  private wireSelectionSystem(): void {
    this.selectionVisualController.wireViewports([
      this.viewport2DTop,
      this.viewport2DFront,
      this.viewport2DSide,
      this.viewport3D,
    ]);
    this.selectionManager.onSelectionChanged(() => this.onSelectionChanged());
  }

  /** Sets up the transform gizmo system and event wiring. */
  private setupTransformSystem(): void {
    this.transformInteractionBridge = new TransformInteractionBridge({
      selectionManager: this.selectionManager,
      selectionVisualController: this.selectionVisualController,
      transformGizmo: this.transformGizmo,
      transformHandler: this.transformHandler,
      transformExecutor: this.transformExecutor,
      gridSnap: this.gridSnap,
      inputManager: this.inputManager,
      viewportSyncManager: this.viewportSyncManager,
      propertiesPanel: this.propertiesPanel,
      worldObject: this.worldObject,
      viewport3D: this.viewport3D,
      getUserSnapEnabled: () => this.userSnapEnabled,
      isTransformSpaceLocal: () => this.transformSpace === TransformSpace.Local,
      syncPrimitivesToViewports: () => this.syncPrimitivesToViewports(),
      onTransformsCommitted: (meshes) => this.solidModelController?.onTransformsCommitted(meshes),
      onTransformsLive: (meshes) => this.solidModelController?.onTransformsLive(meshes),
      isInteractionEnabled: () => !this.isFaceSelectionModeActive() && !this.isClipPlaneToolActive(),
      onRulerTransformFeedback: (meshes, phase) => this.onCadRulerTransformFeedback(meshes, phase),
    });
    this.transformInteractionBridge.wireViewports([
      this.viewport3D,
      this.viewport2DTop,
      this.viewport2DFront,
      this.viewport2DSide,
    ]);
  }

  /** Sets up keyboard shortcuts using the dedicated shortcut handler. */
  private setupKeyboardShortcuts(): void {
    this.keyboardShortcutHandler = createAndRegisterKeyboardShortcuts(
      this.inputManager,
      {
        isCameraNavigating: () => this.viewport3D.isCameraNavigating(),
        onTransformMode: (mode) => this.onTransformMode(mode),
        onDeleteSelected: () => this.onDeleteSelected(),
        onEscapeCancel: () => this.onEscapeCancel(),
        onUndo: () => this.onUndo(),
        onRedo: () => this.onRedo(),
        onGroupSelected: () => this.onGroupSelected(),
        onSaveScene: () => this.onSaveScene(),
        onLoadScene: () => this.onLoadScene(),
        onExportGlb: () => this.onExportGlb(),
        getObjectActionHandler: () => this.objectActionHandler,
        getAlignmentHandler: () => this.alignmentHandler,
      },
      () => this.settingsStore!.getKeyboardShortcutSettings(),
    );
  }

  /** Creates the floating UV editor panel and controller. */
  private setupUvEditor(): void {
    const result = setupUvEditorPanel({
      selectionManager: this.selectionManager,
      faceController: this.faceModeCoordinator.getFaceExtrusionController(),
      commandStack: this.commandStack,
      toolbarContainer: this.toolbarContainer,
      anchorViewport: this.viewports[3]!,
      statusBar: this.statusBar,
      afterSurfaceChange: () => this.refreshShadingAfterSurfaceEdit(),
    });
    this.uvEditor = result.uvEditor;
    this.uvEditorController = result.uvEditorController;
  }

  /** Toggles the UV editor panel. */
  private onToggleUvEditor(): void {
    this.uvEditor?.toggle();
    if (this.uvEditor?.isOpen()) {
      this.uvEditorController?.refreshFromSelection();
      this.statusBar?.setLastAction('UV Editor opened');
    }
  }

  /** Creates the floating texture browser, library wiring, and assignment. */
  private setupTextureBrowser(): void {
    const result = setupTextureBrowserPanel({
      selectionManager: this.selectionManager,
      faceController: this.faceModeCoordinator.getFaceExtrusionController(),
      commandStack: this.commandStack,
      toolbarContainer: this.toolbarContainer,
      anchorViewport: this.viewports[3]!,
      statusBar: this.statusBar,
      afterSurfaceChange: () => this.refreshShadingAfterSurfaceEdit(),
    });
    this.textureBrowser = result.textureBrowser;
    this.textureBrowserController = result.textureBrowserController;
    this.textureAssignmentController = result.textureAssignmentController;
    this.textureAssignmentController.setAfterSolidTextureAssign(() => {
      this.syncPrimitivesToViewports();
      this.refreshShadingAfterSurfaceEdit();
    });
  }

  /** Keeps viewport shading snapshots aligned after surface materials change. */
  private refreshShadingAfterSurfaceEdit(): void {
    this.shadingModeCoordinator?.updateShadingMeshes();
  }

  /** Toggles the texture browser panel. */
  private onToggleTextureBrowser(): void {
    this.textureBrowser?.toggle();
    if (this.textureBrowser?.isOpen()) {
      this.statusBar?.setLastAction('Texture browser opened');
    }
  }

  /**
   * Handles selection change events by updating gizmo and selection-dependent
   * panels. Does not rebuild the outliner tree — OutlinerPanel listens to
   * SelectionManager and updates highlight/reveal incrementally (full tree
   * rebuilds on hierarchy mutations stay on refreshOutliner).
   */
  private onSelectionChanged(): void {
    this.updateGizmoVisibility();
    this.updateGizmoPivot();
    this.uvEditorController?.refreshFromSelection();
    this.refreshCadRulersFromSelection();
  }

  /** Rebuilds CAD size dimensions for the current object selection. */
  private refreshCadRulersFromSelection(): void {
    const selected = filterUnlockedObjects(this.selectionManager.getAllSelectedObjectsAsArray());
    this.cadRulerSystem.setSelectionMeshes(selected);
  }

  /**
   * Drives CAD ghost bounds and delta rulers during transform interaction.
   *
   * @param meshes Selected meshes involved in the transform.
   * @param phase Drag lifecycle phase.
   */
  private onCadRulerTransformFeedback(meshes: THREE.Mesh[], phase: 'begin' | 'move' | 'end'): void {
    if (phase === 'end') {
      this.cadRulerSystem.endDrag();
      this.cadRulerSystem.setSelectionMeshes(meshes);
      return;
    }
    if (phase === 'begin') {
      this.beginCadRulerDrag(meshes);
      return;
    }
    this.updateCadRulerDrag(meshes);
    this.publishCadRulerStatus();
  }

  /**
   * Captures pre-drag bounds for CAD ghost wireframes and delta chains.
   *
   * @param meshes Selected meshes at pointer-down.
   */
  private beginCadRulerDrag(meshes: THREE.Mesh[]): void {
    const startBounds = this.transformHandler.getDragStartBounds() ?? this.rulerBoundsBuilder.buildFromMeshes(meshes);
    this.cadRulerSystem.beginDrag(startBounds, this.resolveCadRulerDragMode());
    this.cadRulerSystem.updateLiveSelectionMeshes(meshes);
  }

  /**
   * Chooses CAD feedback mode: face-travel for resize/scale, translation path
   * for move tools.
   *
   * @returns Drag mode for the ruler system.
   */
  private resolveCadRulerDragMode(): 'translate' | 'resize' {
    if (this.transformHandler.isBoundsResizeDrag()) return 'resize';
    if (this.transformGizmo.getMode() === TransformMode.SCALE) return 'resize';
    return 'translate';
  }

  /**
   * Updates CAD drag feedback from live mesh poses. Resize uses face travel;
   * translate uses actual bounds center motion (includes grid snap).
   *
   * @param meshes Selected meshes during drag.
   */
  private updateCadRulerDrag(meshes: THREE.Mesh[]): void {
    const liveBounds = this.rulerBoundsBuilder.buildFromMeshes(meshes);
    if (this.cadRulerSystem.getDragMode() === 'resize') {
      this.cadRulerSystem.updateResizeDrag(liveBounds);
      return;
    }
    if (this.cadRulerSystem.getDragMode() === 'translate') {
      this.cadRulerSystem.updateTranslateDragFromLiveBounds(liveBounds);
      return;
    }
    this.cadRulerSystem.updateLiveSelectionMeshes(meshes);
  }

  /** Pushes live CAD delta text into the status bar while dragging. */
  private publishCadRulerStatus(): void {
    const status = this.cadRulerSystem.getStatusText();
    if (status.length === 0) return;
    this.statusBar?.setLastAction(status);
  }

  /**
   * Returns whether face selection mode is currently active.
   *
   * @returns True when the editor is in face selection mode.
   */
  private isFaceSelectionModeActive(): boolean {
    if (!this.faceModeCoordinator) return false;
    return this.faceModeCoordinator.getSelectionMode() === SelectionMode.FACE;
  }

  /**
   * Returns whether the clip plane tool is currently active.
   *
   * @returns True when clip placement is live.
   */
  private isClipPlaneToolActive(): boolean {
    return this.clipPlaneTool.isActive();
  }

  /** Updates the gizmo pivot to the selection center. */
  private updateGizmoPivot(): void {
    updateLayoutGizmoPivot(this.getGizmoContext());
  }

  /** Switches gizmo handles to world axes. */
  private onSetTransformSpaceGlobal(): void {
    this.setTransformSpace(TransformSpace.Global);
  }

  /** Switches gizmo handles to the selected object's local axes. */
  private onSetTransformSpaceLocal(): void {
    this.setTransformSpace(TransformSpace.Local);
  }

  /**
   * Returns whether transform space is currently local.
   *
   * @returns True when Local is active.
   */
  private isTransformSpaceLocal(): boolean {
    return this.transformSpace === TransformSpace.Local;
  }

  /**
   * Applies a transform space mode, updates toolbar, and refreshes gizmos.
   *
   * @param space Global or Local.
   */
  private setTransformSpace(space: TransformSpace): void {
    applyLayoutTransformSpace(this.getGizmoContext(), space, (nextSpace) => {
      this.transformSpace = nextSpace;
    });
  }

  /**
   * Builds gizmo helper dependencies from current layout fields.
   *
   * @returns Gizmo context bag.
   */
  private getGizmoContext(): LayoutGizmoContext {
    return {
      selectionManager: this.selectionManager,
      transformGizmo: this.transformGizmo,
      transformExecutor: this.transformExecutor,
      transformSpace: this.transformSpace,
      viewport3D: this.viewport3D,
      toolbar: this.toolbar,
      showStatusMessage: (message) => this.showStatusMessage(message),
    };
  }

  /** Refreshes the outliner panel with current scene objects. */
  private refreshOutliner(): void {
    const meshes: THREE.Mesh[] = [];
    this.worldObject.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        meshes.push(child);
      }
    });
    this.outlinerPanel.refresh(meshes);
  }

  /** Handles post-primitive-creation synchronization and UI refresh. */
  private onPrimitiveCreated(): void {
    this.refreshAfterWorldMutation();
  }

  /** Creates a procedural terrain mesh and selects it. */
  private onAddTerrain(): void {
    const mesh = this.terrainGenerator.createTerrain(20, 20, 32, 2.5, Date.now() % 1000);
    this.commandStack.push(new CreateTerrainCommand(mesh, this.worldObject));
    this.selectionManager.selectObject(mesh);
    this.refreshAfterWorldMutation();
    this.showStatusMessage(`Created ${mesh.name}`);
  }

  /**
   * Updates the status bar axis restriction display.
   *
   * @param axis The active alignment axis restriction.
   */
  private onAxisRestrictionChanged(axis: AlignmentAxis): void {
    this.statusBar?.setAxisRestriction(AlignmentAxis[axis]);
  }

  /**
   * Displays a message in the status bar.
   *
   * @param message The message text to display.
   */
  private showStatusMessage(message: string): void {
    this.statusBar?.setLastAction(message);
  }

  /**
   * Handles transform mode change from toolbar or keyboard.
   *
   * @param mode The new transform mode to activate.
   */
  private onTransformMode(mode: TransformMode): void {
    this.transformGizmo.setMode(mode);
    this.updateGizmoPivot();
    this.updateTransformButtons();
  }

  /** Updates tools palette transform highlights and status bar mode text. */
  private updateTransformButtons(): void {
    applyTransformModeUi(this.toolsPalette, this.statusBar, this.transformGizmo.getMode());
  }

  /** Handles the Save Scene toolbar button and Ctrl+S shortcut. */
  private onSaveScene(): void {
    void this.sceneIOHandler.saveScene(this.worldObject, this.statusBar);
  }

  /** Handles the Load Scene toolbar button and Ctrl+O shortcut. */
  private onLoadScene(): void {
    void this.sceneIOHandler.loadScene(this.worldObject, () => this.onSceneLoaded(), this.statusBar);
  }

  /** Handles post-load synchronization and UI refresh. */
  private onSceneLoaded(): void {
    handleLayoutSceneLoaded({
      selectionManager: this.selectionManager,
      faceModeCoordinator: this.faceModeCoordinator,
      commandStack: this.commandStack,
      clipPlaneHandler: this.clipPlaneHandler,
      snapSettingsController: this.snapSettingsController,
      worldObject: this.worldObject,
      propertiesPanel: this.propertiesPanel,
      refreshAfterWorldMutation: () => this.refreshAfterWorldMutation(),
      updateGizmoVisibility: () => this.updateGizmoVisibility(),
      updateGizmoPivot: () => this.updateGizmoPivot(),
    });
  }

  /**
   * Handles the Export GLB toolbar button and Ctrl+Shift+E shortcut. Reads the
   * active game profile to drive coordinate space and unit conversion before
   * invoking the scene I/O handler.
   */
  private onExportGlb(): void {
    this.ensureSettingsSystem();
    const profile = this.settingsStore?.getActiveGameProfile() ?? null;
    runLayoutExportGlb(this.sceneIOHandler, this.worldObject, this.statusBar, profile);
  }

  /** Handles File → Import VMF: picks a map and places a solid model. */
  private onImportVmf(): void {
    void runLayoutVmfImport(this.sceneIOHandler, this.statusBar, this.solidModelController, () =>
      this.refreshAfterWorldMutation(),
    );
  }

  /** Handles the undo action from toolbar or keyboard shortcut. */
  private onUndo(): void {
    this.onHistoryChange('undo');
  }

  /** Handles the redo action from toolbar or keyboard shortcut. */
  private onRedo(): void {
    this.onHistoryChange('redo');
  }

  /**
   * Applies undo or redo and refreshes dependent editor UI state.
   *
   * @param direction Whether to undo or redo the top command.
   */
  private onHistoryChange(direction: 'undo' | 'redo'): void {
    applyLayoutHistoryChange(
      {
        selectionManager: this.selectionManager,
        faceModeCoordinator: this.faceModeCoordinator,
        commandStack: this.commandStack,
        clipPlaneHandler: this.clipPlaneHandler,
        snapSettingsController: this.snapSettingsController,
        worldObject: this.worldObject,
        propertiesPanel: this.propertiesPanel,
        refreshAfterWorldMutation: () => this.refreshAfterWorldMutation(),
        updateGizmoVisibility: () => this.updateGizmoVisibility(),
        updateGizmoPivot: () => this.updateGizmoPivot(),
      },
      direction,
    );
  }

  /**
   * Syncs viewports, outliner, shading, face selection, and CAD rulers after
   * world changes.
   */
  private refreshAfterWorldMutation(): void {
    this.syncPrimitivesToViewports();
    this.refreshOutliner();
    this.shadingModeCoordinator.updateShadingMeshes();
    this.faceModeCoordinator.updateFaceSelectionMeshes();
    // Undo/redo and other world edits leave mesh poses changed without a new
    // selection event — re-measure so rulers do not float at stale positions.
    this.cadRulerSystem.endDrag();
    this.refreshCadRulersFromSelection();
  }

  /**
   * Syncs world objects to all 2D viewport scenes and restores selection
   * outlines.
   */
  private syncPrimitivesToViewports(): void {
    this.viewportSyncManager.syncWorldObjectToViewports(this.worldObject);
    this.shadingModeCoordinator?.updateShadingMeshes();
    this.selectionVisualController?.reapplyAfterViewportSync();
  }

  /** Binds the shared render loop to live viewports and coordinators. */
  private bindRenderLoop(): void {
    this.renderLoop.bind({
      viewport3D: this.viewport3D,
      viewport2DTop: this.viewport2DTop,
      viewport2DFront: this.viewport2DFront,
      viewport2DSide: this.viewport2DSide,
      cameraFitCoordinator: this.cameraFitCoordinator,
      clipPlaneHandler: this.clipPlaneHandler,
      onBeforeRender: () => {
        this.updateGizmoCameraScale();
        this.cadRulerSystem.refreshLabelProjection();
      },
    });
  }

  /** Creates ResizeObserver-based resize handling for all viewports. */
  private watchResize(): void {
    this.renderLoop.watchResize(this.viewports, () => this.resizeAll());
    requestAnimationFrame(() => this.resizeAll());
  }

  /** Resizes all viewports to match their container dimensions. */
  private resizeAll(): void {
    const allViewports = [this.viewport2DTop, this.viewport2DFront, this.viewport2DSide, this.viewport3D];
    allViewports.forEach((vp, index) => {
      const rect = this.viewports[index]!.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        vp.resize(rect.width, rect.height);
      }
    });
  }

  /**
   * Starts the render loop and animation frame updates. No-op when already
   * running or after dispose.
   */
  start(): void {
    if (this.isDisposed) return;
    this.renderLoop.start();
  }

  /**
   * Stops the render loop without disposing resources. Safe to call when not
   * running.
   */
  stop(): void {
    this.renderLoop.stop();
  }

  /**
   * Stops the editor, unregisters global listeners, and releases owned
   * resources. Safe to call more than once.
   */
  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.renderLoop.dispose();
    this.keyboardShortcutHandler?.unregister();
    this.inputManager?.dispose();
    this.disposeOwnedUiAndManagers();
  }

  /** Disposes subsystems that own DOM listeners, GPU helpers, or stacks. */
  private disposeOwnedUiAndManagers(): void {
    disposeLayoutOwnedResources({
      faceExtrusionController: this.faceModeCoordinator?.getFaceExtrusionController(),
      selectionVisualController: this.selectionVisualController,
      selectionManager: this.selectionManager,
      commandStack: this.commandStack,
      transformGizmo: this.transformGizmo,
      gizmoRaycaster: this.gizmoRaycaster,
      primitiveTool: this.primitiveTool,
      propertiesPanel: this.propertiesPanel,
      outlinerPanel: this.outlinerPanel,
      toolbar: this.toolbar,
      statusBar: this.statusBar,
      uvEditor: this.uvEditor,
      textureBrowserController: this.textureBrowserController,
      textureBrowser: this.textureBrowser,
      toolsPalette: this.toolsPalette,
      settingsDialog: this.settingsDialog,
      settingsApplicator: this.settingsApplicator,
      aboutDialog: this.aboutDialog,
      cadRulerSystem: this.cadRulerSystem,
    });
    this.settingsUnsubscribe?.();
    this.settingsUnsubscribe = null;
  }

  /** Keeps the transform gizmo a readable size relative to the 3D camera. */
  private updateGizmoCameraScale(): void {
    updateLayoutGizmoCameraScale(this.getGizmoContext());
  }

  /**
   * Test/debug helper exposing internal subsystem references. Not part of the
   * public editor API; prefer dedicated accessors if needed.
   *
   * @returns An object containing references to editor subsystems.
   */
  getComponentsForTesting(): object {
    return buildLayoutTestComponents({
      viewport3D: this.viewport3D,
      viewport2DTop: this.viewport2DTop,
      viewport2DFront: this.viewport2DFront,
      viewport2DSide: this.viewport2DSide,
      selectionManager: this.selectionManager,
      primitiveTool: this.primitiveTool,
      toolbar: this.toolbar,
      outlinerPanel: this.outlinerPanel,
      transformGizmo: this.transformGizmo,
      transformHandler: this.transformHandler,
      gridSnap: this.gridSnap,
      propertiesPanel: this.propertiesPanel,
      transformExecutor: this.transformExecutor,
      commandStack: this.commandStack,
      statusBar: this.statusBar,
      faceModeCoordinator: this.faceModeCoordinator,
      cadRulerSystem: this.cadRulerSystem,
    });
  }
}
