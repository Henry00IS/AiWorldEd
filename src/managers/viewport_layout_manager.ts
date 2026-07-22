import * as THREE from 'three';
import { Theme } from '../theme.js';
import { InputManager } from './input_manager.js';
import { Viewport3D } from '../viewports/viewport_3d.js';
import { Viewport2D } from '../viewports/viewport_2d.js';
import { SelectionManager } from './selection_manager.js';
import { SelectionVisualController } from './selection_visual_controller.js';
import { HierarchyReparentHandler } from './hierarchy_reparent_handler.js';
import { PrimitiveCreationTool } from './primitive_creation_tool.js';
import { Toolbar } from '../ui/toolbar.js';
import { OutlinerPanel } from '../ui/outliner_panel.js';
import { PropertiesPanel } from '../ui/properties_panel.js';
import { TransformGizmo } from '../transform/transform_gizmo.js';
import { GizmoRaycaster } from '../transform/gizmo_raycaster.js';
import { TransformExecutor } from '../transform/transform_executor.js';
import { TransformHandler } from '../transform/transform_handler.js';
import { TransformConstraint } from '../transform/transform_constraint.js';
import { GridSnap } from '../transform/grid_snap.js';
import { SnapManager } from '../transform/snap_manager.js';
import { TransformMode } from '../types/transform_mode.js';
import { SelectionMode } from '../types/selection_mode.js';
import { CommandStack } from '../commands/command_stack.js';
import { StatusBar } from '../ui/status_bar.js';
import { ViewportSyncManager } from './viewport_sync_manager.js';
import { PrimitiveCreationHandler } from './primitive_creation_handler.js';
import { KeyboardShortcutHandler } from './keyboard_shortcut_handler.js';
import { ObjectActionHandler } from './object_action_handler.js';
import { AlignmentHandler } from './alignment_handler.js';
import { AlignmentController } from './alignment_controller.js';
import { AlignmentAxis } from '../types/alignment_axis.js';
import { SceneIOHandler } from './scene_io_handler.js';
import { CsgActionHandler } from './csg_action_handler.js';
import { CsgOperation } from '../csg/csg_boolean_ops.js';
import { TerrainGenerator } from '../terrain/terrain_generator.js';
import { CreateTerrainCommand } from '../commands/create_terrain_command.js';
import { UvEditor } from '../ui/uv_editor.js';
import { UvEditorController } from './uv_editor_controller.js';
import { TextureBrowser } from '../ui/texture_browser.js';
import { TextureBrowserController } from './texture_browser_controller.js';
import { TextureAssignmentController } from './texture_assignment_controller.js';
import { TextureLockSettings } from '../texture/texture_lock_settings.js';
import {
  EditorShellBuilder,
  applyOutlinerRename,
  applyOutlinerVisibilityToggle,
  applyOutlinerLockToggle,
  handleOutlinerDuplicate
} from './editor_shell_builder.js';
import { filterUnlockedObjects } from '../utils/object_lock.js';
import { ViewportSceneBootstrap } from './viewport_scene_bootstrap.js';
import { TransformInteractionBridge } from './transform_interaction_bridge.js';
import { FaceModeCoordinator } from './face_mode_coordinator.js';
import { SnapSettingsController } from './snap_settings_controller.js';
import { CameraFitCoordinator } from './camera_fit_coordinator.js';
import { ShadingModeCoordinator } from './shading_mode_coordinator.js';
import { ToolsPalette } from '../ui/tools_palette.js';
import { ToolsPaletteController } from './tools_palette_controller.js';
import { ClipPlaneTool } from './clip_plane_tool.js';
import { ClipPlaneHandler } from './clip_plane_handler.js';
import { EditorToolId } from '../types/editor_tool_id.js';
import {
  DEFAULT_COMMAND_STACK_MAX_SIZE,
  DEFAULT_GRID_SNAP_INTERVAL
} from '../types/editor_config.js';

/**
 * Root composition manager for the four-viewport editor layout.
 * Builds UI shell, viewports, and wires specialized coordinators.
 */
export class ViewportLayoutManager {
  private container: HTMLElement;
  private viewports: HTMLElement[];
  private viewport3D: Viewport3D;
  private viewport2DTop: Viewport2D;
  private viewport2DFront: Viewport2D;
  private viewport2DSide: Viewport2D;
  private inputManager: InputManager;
  private worldObject: THREE.Group;
  private lastTime: number;
  private animationFrameId: number | null;
  private resizeObserver: ResizeObserver | null;
  private isDisposed: boolean;
  private isRunning: boolean;
  private selectionManager: SelectionManager;
  private selectionVisualController: SelectionVisualController;
  private hierarchyReparentHandler: HierarchyReparentHandler;
  private primitiveTool: PrimitiveCreationTool;
  private toolbar: Toolbar;
  private outlinerPanel: OutlinerPanel;
  private propertiesPanel: PropertiesPanel;
  private toolbarContainer: HTMLElement;
  private transformGizmo: TransformGizmo;
  private gizmoRaycaster: GizmoRaycaster;
  private transformExecutor: TransformExecutor;
  private transformHandler: TransformHandler;
  private gridSnap: GridSnap;
  private userSnapEnabled: boolean;
  private snapManager: SnapManager;
  private transformConstraint: TransformConstraint;
  private commandStack: CommandStack;
  private statusBar: StatusBar | null;
  private viewportSyncManager: ViewportSyncManager;
  private primitiveCreationHandler: PrimitiveCreationHandler;
  private keyboardShortcutHandler: KeyboardShortcutHandler;
  private objectActionHandler: ObjectActionHandler;
  private alignmentHandler: AlignmentHandler;
  private sceneIOHandler: SceneIOHandler;
  private faceModeCoordinator: FaceModeCoordinator;
  private snapSettingsController: SnapSettingsController;
  private cameraFitCoordinator: CameraFitCoordinator;
  private shadingModeCoordinator: ShadingModeCoordinator;
  private transformInteractionBridge: TransformInteractionBridge;
  private csgActionHandler: CsgActionHandler;
  private terrainGenerator: TerrainGenerator;
  private uvEditor: UvEditor | null;
  private uvEditorController: UvEditorController | null;
  private textureBrowser: TextureBrowser | null;
  private textureBrowserController: TextureBrowserController | null;
  private textureAssignmentController: TextureAssignmentController | null;
  private textureLock: TextureLockSettings;
  private toolsPalette: ToolsPalette | null;
  private toolsPaletteController: ToolsPaletteController | null;
  private clipPlaneTool: ClipPlaneTool;
  private clipPlaneHandler: ClipPlaneHandler | null;

  /**
   * Creates the viewport layout with toolbar, outliner, and four viewports.
   * @param editorContainer The root DOM element for the editor UI.
   */
  constructor(editorContainer: HTMLElement) {
    this.container = editorContainer;
    this.initializeCoreSystems();
    this.buildShellAndViewports();
    this.wireHandlersAndCoordinators();
    this.watchResize();
  }

  /**
   * Constructs core managers that do not depend on DOM layout.
   */
  private initializeCoreSystems(): void {
    this.inputManager = new InputManager();
    this.lastTime = performance.now();
    this.animationFrameId = null;
    this.resizeObserver = null;
    this.isDisposed = false;
    this.isRunning = false;
    this.worldObject = new THREE.Group();
    this.selectionManager = new SelectionManager();
    this.primitiveTool = new PrimitiveCreationTool(this.worldObject);
    this.gridSnap = new GridSnap(true, DEFAULT_GRID_SNAP_INTERVAL);
    this.userSnapEnabled = true;
    this.snapManager = new SnapManager(DEFAULT_GRID_SNAP_INTERVAL);
    this.transformConstraint = new TransformConstraint();
    this.transformExecutor = new TransformExecutor(this.gridSnap);
    this.transformGizmo = new TransformGizmo(Theme);
    this.gizmoRaycaster = new GizmoRaycaster();
    this.commandStack = new CommandStack(DEFAULT_COMMAND_STACK_MAX_SIZE);
    this.transformHandler = new TransformHandler(
      this.transformGizmo,
      this.gizmoRaycaster,
      this.transformExecutor,
      this.transformConstraint,
      this.commandStack
    );
    this.textureLock = new TextureLockSettings(true);
    this.transformHandler.setTextureLockSettings(this.textureLock);
    this.hierarchyReparentHandler = new HierarchyReparentHandler(
      this.worldObject,
      this.commandStack
    );
    this.uvEditor = null;
    this.uvEditorController = null;
    this.textureBrowser = null;
    this.textureBrowserController = null;
    this.textureAssignmentController = null;
    this.toolsPalette = null;
    this.toolsPaletteController = null;
    this.clipPlaneTool = new ClipPlaneTool();
    this.clipPlaneHandler = null;
    this.terrainGenerator = new TerrainGenerator();
  }

  /**
   * Builds the DOM shell and instantiates the four viewports.
   */
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
      this.createToolbarActions()
    );
    this.toolbarContainer = shell.toolbarContainer;
    this.viewports = shell.viewports;
    this.toolbar = shell.toolbar;
    this.outlinerPanel = shell.outlinerPanel;
    this.propertiesPanel = shell.propertiesPanel;
    this.statusBar = shell.statusBar;
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
      this.viewport3D
    );
    bootstrap.addSharedObjects(
      this.worldObject,
      viewports,
      this.viewportSyncManager,
      this.transformGizmo
    );
    this.syncPrimitivesToViewports();
    this.updateTransformButtons();
  }

  /**
   * Wires specialized handlers after viewports and shell exist.
   */
  private wireHandlersAndCoordinators(): void {
    this.createSelectionAndPrimitiveHandlers();
    this.createActionHandlers();
    this.refreshOutliner();
    this.wireSelectionSystem();
    this.setupTransformSystem();
    this.setupKeyboardShortcuts();
    this.sceneIOHandler = new SceneIOHandler();
    this.setupCameraAndShadingCoordinators();
    this.setupFaceModeCoordinator();
    this.setupUvEditor();
    this.setupTextureBrowser();
    this.setupToolsPaletteAndClip();
    this.setupSnapSettingsController();
  }

  /**
   * Creates selection visuals and primitive creation wiring.
   */
  private createSelectionAndPrimitiveHandlers(): void {
    this.selectionVisualController = new SelectionVisualController(
      this.selectionManager,
      this.viewportSyncManager
    );
    this.primitiveCreationHandler = new PrimitiveCreationHandler(
      this.primitiveTool,
      this.worldObject,
      this.commandStack,
      this.selectionManager
    );
    this.primitiveCreationHandler.setOnPrimitiveCreated(() => this.onPrimitiveCreated());
  }

  /**
   * Creates object, CSG, and alignment action handlers.
   */
  private createActionHandlers(): void {
    this.objectActionHandler = this.createObjectActionHandler();
    this.bindObjectActionCallbacks();
    this.csgActionHandler = this.createCsgActionHandler();
    this.bindCsgActionCallbacks();
    this.alignmentHandler = this.createAlignmentHandler();
    this.bindAlignmentCallbacks();
  }

  /**
   * Creates camera fit and shading coordinators and binds their controls.
   */
  private setupCameraAndShadingCoordinators(): void {
    this.cameraFitCoordinator = new CameraFitCoordinator(
      this.selectionManager,
      this.statusBar,
      () => this.shadingModeCoordinator.getOrderedViewports(),
      () => this.shadingModeCoordinator.getActiveViewportIndex()
    );
    this.cameraFitCoordinator.bindKeyboardShortcuts(this.keyboardShortcutHandler);
    this.shadingModeCoordinator = new ShadingModeCoordinator(
      this.viewport2DTop,
      this.viewport2DFront,
      this.viewport2DSide,
      this.viewport3D,
      this.viewports,
      this.selectionVisualController,
      this.statusBar
    );
    this.shadingModeCoordinator.wireControls(
      this.keyboardShortcutHandler,
      (viewport) => this.cameraFitCoordinator.fitSpecificViewport(viewport)
    );
  }

  /**
   * Creates the face selection/extrusion coordinator.
   */
  private setupFaceModeCoordinator(): void {
    this.faceModeCoordinator = new FaceModeCoordinator({
      viewport3D: this.viewport3D,
      viewport2DTop: this.viewport2DTop,
      viewport2DFront: this.viewport2DFront,
      viewport2DSide: this.viewport2DSide,
      commandStack: this.commandStack,
      gridSnap: this.gridSnap,
      worldObject: this.worldObject,
      selectionManager: this.selectionManager,
      toolbar: this.toolbar,
      statusBar: this.statusBar,
      keyboardShortcutHandler: this.keyboardShortcutHandler,
      showStatusMessage: (message) => this.showStatusMessage(message),
      syncPrimitivesToViewports: () => this.syncPrimitivesToViewports(),
      updateShadingMeshes: () => this.shadingModeCoordinator.updateShadingMeshes(),
      refreshOutliner: () => this.refreshOutliner(),
      onSelectionModeUiChanged: (mode) => {
        this.toolsPaletteController?.onExternalSelectionModeChanged(mode);
      }
    });
  }

  /**
   * Creates the floating Tools palette, clip plane tool, and related wiring.
   */
  private setupToolsPaletteAndClip(): void {
    this.clipPlaneHandler = new ClipPlaneHandler({
      worldObject: this.worldObject,
      commandStack: this.commandStack,
      selectionManager: this.selectionManager,
      gridSnap: this.gridSnap,
      clipPlaneTool: this.clipPlaneTool,
      showStatusMessage: (message) => this.showStatusMessage(message),
      syncPrimitivesToViewports: () => this.syncPrimitivesToViewports(),
      refreshOutliner: () => this.refreshOutliner(),
      updateShadingMeshes: () => this.shadingModeCoordinator.updateShadingMeshes(),
      onToolStateChanged: () => this.onClipToolStateChanged()
    });
    this.toolsPalette = new ToolsPalette(
      this.toolbarContainer,
      {
        onSelectTool: (toolId) => this.toolsPaletteController?.selectTool(toolId),
        onFlipClipPlane: () => this.clipPlaneHandler?.flipPlane(),
        onCommitClip: () => this.clipPlaneHandler?.commitClip(),
        onCommitSplit: () => this.clipPlaneHandler?.commitSplit()
      },
      this.viewports[3]
    );
    this.toolsPaletteController = new ToolsPaletteController({
      toolsPalette: this.toolsPalette,
      faceExtrusionController:
        this.faceModeCoordinator.getFaceExtrusionController(),
      clipPlaneTool: this.clipPlaneTool,
      clipPlaneHandler: this.clipPlaneHandler,
      selectionManager: this.selectionManager,
      showStatusMessage: (message) => this.showStatusMessage(message)
    });
    this.wireClipPlaneViewportCallbacks();
    this.wireClipPlaneKeyboardShortcuts();
    this.toolsPalette.show();
  }

  /**
   * Wires clip plane pointer callbacks on all viewports.
   */
  private wireClipPlaneViewportCallbacks(): void {
    const viewports = [
      this.viewport3D,
      this.viewport2DTop,
      this.viewport2DFront,
      this.viewport2DSide
    ];
    viewports.forEach((viewport) => {
      viewport.setClipPlaneCallback((event) => {
        if (!this.clipPlaneHandler) return false;
        return this.clipPlaneHandler.onPointerDown(
          event,
          viewport.getCamera(),
          viewport.getRenderer()
        );
      });
    });
  }

  /**
   * Wires keyboard shortcuts used while the clip plane tool is active.
   */
  private wireClipPlaneKeyboardShortcuts(): void {
    this.keyboardShortcutHandler.setClipPlaneShortcuts(
      () => this.isClipPlaneToolActive(),
      () => this.clipPlaneHandler?.flipPlane(),
      () => this.clipPlaneHandler?.commitClip(),
      () => this.clipPlaneHandler?.commitSplit(),
      () => this.onClipCancel()
    );
  }

  /**
   * Cancels the clip tool and returns to object select in the palette.
   */
  private onClipCancel(): void {
    this.clipPlaneHandler?.cancel();
    this.toolsPaletteController?.selectTool(EditorToolId.OBJECT);
  }

  /**
   * Refreshes palette context and hides transform gizmos while clipping.
   */
  private onClipToolStateChanged(): void {
    this.toolsPaletteController?.refreshPaletteContext();
    this.updateGizmoVisibility();
  }

  /**
   * Shows or hides transform/bounds gizmos based on selection and active tools.
   */
  private updateGizmoVisibility(): void {
    const selected = this.selectionManager.getAllSelectedObjectsAsArray();
    const unlockedSelected = filterUnlockedObjects(selected);
    this.transformGizmo.setVisible(
      unlockedSelected.length > 0
        && !this.isFaceSelectionModeActive()
        && !this.isClipPlaneToolActive()
    );
  }

  /**
   * Clears selection, cancels active tools, and returns to object select.
   */
  private onEscapeCancel(): void {
    this.clipPlaneHandler?.cancel();
    this.toolsPaletteController?.selectTool(EditorToolId.OBJECT);
    this.faceModeCoordinator
      ?.getFaceExtrusionController()
      .clearFaceSelection();
    this.selectionManager.clearSelection();
    this.statusBar?.setLastAction('Selection cleared');
  }

  /**
   * Toggles the floating Tools palette.
   */
  private onToggleToolsPalette(): void {
    this.toolsPalette?.toggle();
    if (this.toolsPalette?.isOpen()) {
      this.statusBar?.setLastAction('Tools palette opened');
    }
  }

  /**
   * Creates and initializes the snap settings controller.
   */
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
      }
    });
    this.snapSettingsController.setup();
  }

  /**
   * Builds outliner action callbacks for the shell builder.
   * @returns Outliner action callback bundle.
   */
  private createOutlinerActions() {
    return {
      onDuplicateFromOutliner: (obj: THREE.Object3D) => {
        handleOutlinerDuplicate(obj, this.selectionManager, this.objectActionHandler);
      },
      onDeleteFromOutliner: (obj: THREE.Object3D) => this.onDeleteFromOutliner(obj),
      onGroupFromOutliner: (objects: THREE.Object3D[]) => {
        this.objectActionHandler.groupObjects(objects);
      },
      onUngroupFromOutliner: (group: THREE.Group) => {
        this.objectActionHandler.ungroupGroup(group);
      },
      onRenameFromOutliner: (obj: THREE.Object3D, newName: string) => {
        applyOutlinerRename(
          this.commandStack, obj, newName, () => this.refreshOutliner()
        );
      },
      onToggleVisibilityFromOutliner: (obj: THREE.Object3D) => {
        applyOutlinerVisibilityToggle(
          this.commandStack, obj, () => this.refreshOutliner()
        );
      },
      onToggleLockFromOutliner: (obj: THREE.Object3D) => {
        applyOutlinerLockToggle(
          obj,
          () => this.refreshOutliner(),
          (message) => this.showStatusMessage(message)
        );
        this.onSelectionChanged();
      },
      reparentFromDrop: (dragged: THREE.Object3D, target: THREE.Object3D | null) =>
        this.hierarchyReparentHandler.reparentFromDrop(dragged, target),
      syncViewports: () => this.syncPrimitivesToViewports(),
      refreshOutliner: () => this.refreshOutliner(),
      showStatusMessage: (message: string) => this.showStatusMessage(message)
    };
  }

  /**
   * Builds toolbar action callbacks for the shell builder.
   * @returns Toolbar action callback bundle.
   */
  private createToolbarActions() {
    return {
      onAddCube: () => this.primitiveCreationHandler.createCube(),
      onAddSphere: () => this.primitiveCreationHandler.createSphere(),
      onAddCylinder: () => this.primitiveCreationHandler.createCylinder(),
      onAddPlane: () => this.primitiveCreationHandler.createPlane(),
      onAddTerrain: () => this.onAddTerrain(),
      onUndo: () => this.onUndo(),
      onRedo: () => this.onRedo(),
      onTransformMode: (mode: TransformMode) => this.onTransformMode(mode),
      onToggleUvEditor: () => this.onToggleUvEditor(),
      onToggleTextureBrowser: () => this.onToggleTextureBrowser(),
      onToggleToolsPalette: () => this.onToggleToolsPalette(),
      onDeleteSelected: () => this.onDeleteSelected(),
      onDuplicateSelected: () => this.objectActionHandler.onDuplicateSelected(),
      onGroupSelected: () => this.onGroupSelected(),
      onUngroupSelected: () => this.objectActionHandler.onUngroupSelected(),
      onExtrudeFaces: () => this.faceModeCoordinator.onExtrudeFaces(),
      onCsgUnion: () => this.csgActionHandler.runBoolean(CsgOperation.UNION),
      onCsgSubtract: () => this.csgActionHandler.runBoolean(CsgOperation.SUBTRACT),
      onCsgIntersect: () => this.csgActionHandler.runBoolean(CsgOperation.INTERSECT),
      onToggleSnap: () => this.snapSettingsController.onToggleSnap(),
      onSnapIntervalBackward: () => this.snapSettingsController.onSnapIntervalBackward(),
      onSnapIntervalForward: () => this.snapSettingsController.onSnapIntervalForward(),
      onToggleTextureLock: () => this.snapSettingsController.onToggleTextureLock(),
      onAlignToOrigin: () => this.alignmentHandler.onAlignToOrigin(),
      onAlignToGridCenter: () => this.alignmentHandler.onAlignToGridCenter(),
      onAlignToObject: () => this.alignmentHandler.onAlignToObject(),
      onSaveScene: () => this.onSaveScene(),
      onLoadScene: () => this.onLoadScene(),
      onExportGlb: () => this.onExportGlb(),
      isUserSnapEnabled: () => this.userSnapEnabled,
      isTextureLockEnabled: () => this.textureLock.isLocked()
    };
  }

  /**
   * Handles deletion of selected objects, preferring outliner hierarchy roots.
   */
  private onDeleteSelected(): void {
    const hierarchyObjects = this.outlinerPanel.getObjectsForGrouping();
    if (hierarchyObjects.length > 0) {
      this.objectActionHandler.deleteHierarchyObjects(hierarchyObjects);
      return;
    }
    this.objectActionHandler.onDeleteSelected();
  }

  /**
   * Groups objects selected in the outliner hierarchy.
   */
  private onGroupSelected(): void {
    const objects = this.outlinerPanel.getObjectsForGrouping();
    if (objects.length === 0) return;
    this.objectActionHandler.groupObjects(objects);
  }

  /**
   * Handles the Delete action from the outliner context menu.
   * @param obj The hierarchy object that was right-clicked.
   */
  private onDeleteFromOutliner(obj: THREE.Object3D): void {
    const objects = this.outlinerPanel.getObjectsForGrouping();
    if (objects.length === 0) {
      this.objectActionHandler.deleteHierarchyObjects([obj]);
      return;
    }
    this.objectActionHandler.deleteHierarchyObjects(objects);
  }

  /**
   * Wires selection state, outlines, and gizmo visibility across viewports.
   */
  private wireSelectionSystem(): void {
    this.selectionVisualController.wireViewports([
      this.viewport2DTop,
      this.viewport2DFront,
      this.viewport2DSide,
      this.viewport3D
    ]);
    this.selectionManager.onSelectionChanged(() => this.onSelectionChanged());
  }

  /**
   * Sets up the transform gizmo system and event wiring.
   */
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
      syncPrimitivesToViewports: () => this.syncPrimitivesToViewports(),
      isInteractionEnabled: () =>
        !this.isFaceSelectionModeActive() && !this.isClipPlaneToolActive()
    });
    this.transformInteractionBridge.wireViewports([
      this.viewport3D,
      this.viewport2DTop,
      this.viewport2DFront,
      this.viewport2DSide
    ]);
  }

  /**
   * Sets up keyboard shortcuts using the dedicated shortcut handler.
   */
  private setupKeyboardShortcuts(): void {
    this.keyboardShortcutHandler = new KeyboardShortcutHandler(this.inputManager);
    this.keyboardShortcutHandler.setNavigationActiveCallback(
      () => this.viewport3D.isCameraNavigating()
    );
    this.keyboardShortcutHandler.setOnTransformMode((mode) => this.onTransformMode(mode));
    this.keyboardShortcutHandler.setOnDeleteSelected(() => this.onDeleteSelected());
    this.keyboardShortcutHandler.setOnEscape(() => this.onEscapeCancel());
    this.keyboardShortcutHandler.setOnUndo(() => this.onUndo());
    this.keyboardShortcutHandler.setOnRedo(() => this.onRedo());
    this.keyboardShortcutHandler.setOnDuplicateSelected(
      () => this.objectActionHandler.onDuplicateSelected()
    );
    this.keyboardShortcutHandler.setOnGroupSelected(() => this.onGroupSelected());
    this.keyboardShortcutHandler.setOnUngroupSelected(
      () => this.objectActionHandler.onUngroupSelected()
    );
    this.keyboardShortcutHandler.setOnAlignToOrigin(
      () => this.alignmentHandler.onAlignToOrigin()
    );
    this.keyboardShortcutHandler.setOnAxisCycle(() => this.alignmentHandler.onAxisCycle());
    this.keyboardShortcutHandler.register();
    this.keyboardShortcutHandler.setOnSaveScene(() => this.onSaveScene());
    this.keyboardShortcutHandler.setOnLoadScene(() => this.onLoadScene());
    this.keyboardShortcutHandler.setOnExportGlb(() => this.onExportGlb());
  }

  /**
   * Creates the floating UV editor panel and controller.
   * Refreshes fields when object or face selection changes.
   */
  private setupUvEditor(): void {
    const faceController = this.faceModeCoordinator.getFaceExtrusionController();
    this.uvEditorController = new UvEditorController(
      this.selectionManager,
      faceController,
      this.commandStack
    );
    this.uvEditorController.setStatusCallback((message) => {
      this.statusBar?.setLastAction(message);
    });
    this.uvEditor = new UvEditor(
      this.toolbarContainer,
      {
        onAlign: (align) => {
          this.uvEditorController?.applyAlign(align);
          this.afterUvEditorSurfaceChange();
        },
        onApplyMapping: (mapping) => {
          this.uvEditorController?.applyMappingFields(mapping);
          this.afterUvEditorSurfaceChange();
        },
        onReset: () => {
          this.uvEditorController?.resetMapping();
          this.afterUvEditorSurfaceChange();
        }
      },
      this.viewports[3]
    );
    this.uvEditorController.setUiRefreshCallback((mapping, count) => {
      this.uvEditor?.setFromSelection(mapping, count);
    });
    faceController.setFaceSelectionChangedCallback(() => {
      this.uvEditorController?.refreshFromSelection();
    });
  }

  /**
   * Toggles the UV editor panel.
   */
  private onToggleUvEditor(): void {
    this.uvEditor?.toggle();
    if (this.uvEditor?.isOpen()) {
      this.uvEditorController?.refreshFromSelection();
      this.statusBar?.setLastAction('UV Editor opened');
    }
  }

  /**
   * Hook used after UV editor apply/reset commands to refresh shading.
   * @param action UV editor action that may have rebuilt materials.
   */
  private afterUvEditorSurfaceChange(): void {
    this.refreshShadingAfterSurfaceEdit();
  }

  /**
   * Creates the floating texture browser, library wiring, and assignment.
   */
  private setupTextureBrowser(): void {
    const faceController = this.faceModeCoordinator.getFaceExtrusionController();
    this.textureAssignmentController = new TextureAssignmentController(
      this.selectionManager,
      faceController,
      this.commandStack
    );
    this.textureAssignmentController.setStatusCallback((message) => {
      this.statusBar?.setLastAction(message);
    });
    this.textureBrowser = new TextureBrowser(
      this.toolbarContainer,
      {
        onOpenFolder: () => {
          void this.textureBrowserController?.openFolder();
        },
        onSelectTexture: (entryId) => {
          this.textureBrowserController?.selectTexture(entryId);
        }
      },
      this.viewports[3]
    );
    this.textureBrowserController = new TextureBrowserController({
      browser: this.textureBrowser
    });
    this.textureBrowserController.setStatusCallback((message) => {
      this.statusBar?.setLastAction(message);
    });
    this.textureBrowserController.setSelectionCallback((entry) => {
      if (!entry) return;
      this.textureAssignmentController?.onTextureSelected(entry);
      this.refreshShadingAfterSurfaceEdit();
    });
  }

  /**
   * Keeps viewport shading snapshots aligned after surface materials change.
   * Prevents stale material restores from undoing per-object texture work.
   */
  private refreshShadingAfterSurfaceEdit(): void {
    this.shadingModeCoordinator?.updateShadingMeshes();
  }

  /**
   * Toggles the texture browser panel.
   */
  private onToggleTextureBrowser(): void {
    this.textureBrowser?.toggle();
    if (this.textureBrowser?.isOpen()) {
      this.statusBar?.setLastAction('Texture browser opened');
    }
  }

  /**
   * Handles selection change events by updating gizmo and outliner.
   */
  private onSelectionChanged(): void {
    this.updateGizmoVisibility();
    this.updateGizmoPivot();
    this.refreshOutliner();
    this.uvEditorController?.refreshFromSelection();
  }

  /**
   * Returns whether face selection mode is currently active.
   * Transform gizmos stay off in face mode so face picks are not blocked.
   * @returns True when the editor is in face selection mode.
   */
  private isFaceSelectionModeActive(): boolean {
    if (!this.faceModeCoordinator) return false;
    return this.faceModeCoordinator.getSelectionMode() === SelectionMode.FACE;
  }

  /**
   * Returns whether the clip plane tool is currently active.
   * @returns True when clip placement is live.
   */
  private isClipPlaneToolActive(): boolean {
    return this.clipPlaneTool.isActive();
  }

  /**
   * Updates the gizmo pivot to the selection center.
   */
  private updateGizmoPivot(): void {
    const selected = Array.from(this.selectionManager.getSelectedObjects());
    if (selected.length > 0) {
      const pivot = this.transformExecutor.computePivot(selected);
      this.transformGizmo.setPivot(pivot);
      this.transformGizmo.updateScaleForCamera(this.viewport3D.getCamera());
      this.transformGizmo.updateBoundsFromMeshes(
        selected,
        this.viewport3D.getCamera()
      );
      return;
    }
    this.transformGizmo.setPivot(new THREE.Vector3(0, 0, 0));
    this.transformGizmo.updateBoundsFromMeshes([]);
  }

  /**
   * Refreshes the outliner panel with current scene objects.
   */
  private refreshOutliner(): void {
    const meshes: THREE.Mesh[] = [];
    this.worldObject.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        meshes.push(child);
      }
    });
    this.outlinerPanel.refresh(meshes);
  }

  /**
   * Handles post-primitive-creation synchronization and UI refresh.
   */
  private onPrimitiveCreated(): void {
    this.syncPrimitivesToViewports();
    this.refreshOutliner();
    this.shadingModeCoordinator.updateShadingMeshes();
    this.faceModeCoordinator.updateFaceSelectionMeshes();
  }

  /**
   * Creates the object action handler instance.
   * @returns A configured ObjectActionHandler.
   */
  private createObjectActionHandler(): ObjectActionHandler {
    return new ObjectActionHandler(
      this.worldObject,
      this.commandStack,
      this.selectionManager
    );
  }

  /**
   * Binds callback functions to the object action handler.
   */
  private bindObjectActionCallbacks(): void {
    this.objectActionHandler.setSyncViewports(() => this.syncPrimitivesToViewports());
    this.objectActionHandler.setRefreshOutliner(() => this.refreshOutliner());
    this.objectActionHandler.setShowStatusMessage(
      (message) => this.showStatusMessage(message)
    );
  }

  /**
   * Creates the CSG action handler.
   * @returns A configured CsgActionHandler.
   */
  private createCsgActionHandler(): CsgActionHandler {
    return new CsgActionHandler(
      this.worldObject,
      this.commandStack,
      this.selectionManager
    );
  }

  /**
   * Binds callbacks for the CSG action handler.
   */
  private bindCsgActionCallbacks(): void {
    this.csgActionHandler.setSyncViewports(() => this.syncPrimitivesToViewports());
    this.csgActionHandler.setRefreshOutliner(() => this.refreshOutliner());
    this.csgActionHandler.setShowStatus((message) => this.showStatusMessage(message));
  }

  /**
   * Creates a procedural terrain mesh and selects it.
   */
  private onAddTerrain(): void {
    const mesh = this.terrainGenerator.createTerrain(20, 20, 32, 2.5, Date.now() % 1000);
    const command = new CreateTerrainCommand(mesh, this.worldObject);
    this.commandStack.push(command);
    this.selectionManager.selectObject(mesh);
    this.syncPrimitivesToViewports();
    this.refreshOutliner();
    this.shadingModeCoordinator.updateShadingMeshes();
    this.faceModeCoordinator.updateFaceSelectionMeshes();
    this.showStatusMessage(`Created ${mesh.name}`);
  }

  /**
   * Creates the alignment handler instance.
   * @returns A configured AlignmentHandler.
   */
  private createAlignmentHandler(): AlignmentHandler {
    const controller = new AlignmentController();
    return new AlignmentHandler(
      controller,
      this.commandStack,
      this.selectionManager,
      this.gridSnap
    );
  }

  /**
   * Binds callback functions to the alignment handler.
   */
  private bindAlignmentCallbacks(): void {
    this.alignmentHandler.setSyncViewports(() => this.syncPrimitivesToViewports());
    this.alignmentHandler.setOnAxisRestriction(
      (axis) => this.onAxisRestrictionChanged(axis)
    );
    if (this.statusBar) {
      this.alignmentHandler.setStatusBar(this.statusBar);
    }
  }

  /**
   * Updates the status bar axis restriction display.
   * @param axis The active alignment axis restriction.
   */
  private onAxisRestrictionChanged(axis: AlignmentAxis): void {
    this.statusBar?.setAxisRestriction(AlignmentAxis[axis]);
  }

  /**
   * Displays a message in the status bar.
   * @param message The message text to display.
   */
  private showStatusMessage(message: string): void {
    this.statusBar?.setLastAction(message);
  }

  /**
   * Handles transform mode change from toolbar or keyboard.
   * @param mode The new transform mode to activate.
   */
  private onTransformMode(mode: TransformMode): void {
    this.transformGizmo.setMode(mode);
    this.updateGizmoPivot();
    this.updateTransformButtons();
  }

  /**
   * Updates the active state of transform mode toolbar buttons.
   */
  private updateTransformButtons(): void {
    const currentMode = this.transformGizmo.getMode();
    this.toolbar.setButtonActiveByLabel('Move', false);
    this.toolbar.setButtonActiveByLabel('Rotate', false);
    this.toolbar.setButtonActiveByLabel('Scale', false);
    this.toolbar.setButtonActiveByLabel('Bounds', false);
    this.setActiveTransformButton(currentMode);
    this.updateStatusBarTransformMode(currentMode);
  }

  /**
   * Marks the toolbar button matching the current transform mode as active.
   * @param mode The active transform mode.
   */
  private setActiveTransformButton(mode: TransformMode): void {
    if (mode === TransformMode.TRANSLATE) {
      this.toolbar.setButtonActiveByLabel('Move', true);
      return;
    }
    if (mode === TransformMode.ROTATE) {
      this.toolbar.setButtonActiveByLabel('Rotate', true);
      return;
    }
    if (mode === TransformMode.SCALE) {
      this.toolbar.setButtonActiveByLabel('Scale', true);
      return;
    }
    this.toolbar.setButtonActiveByLabel('Bounds', true);
  }

  /**
   * Writes the transform mode name into the status bar.
   * @param mode The active transform mode.
   */
  private updateStatusBarTransformMode(mode: TransformMode): void {
    if (!this.statusBar) return;
    if (mode === TransformMode.TRANSLATE) {
      this.statusBar.setTransformMode('Move');
      return;
    }
    if (mode === TransformMode.ROTATE) {
      this.statusBar.setTransformMode('Rotate');
      return;
    }
    if (mode === TransformMode.SCALE) {
      this.statusBar.setTransformMode('Scale');
      return;
    }
    this.statusBar.setTransformMode('Bounds');
  }

  /**
   * Handles the Save Scene toolbar button and Ctrl+S shortcut.
   */
  private onSaveScene(): void {
    void this.executeSaveScene();
  }

  /**
   * Executes the scene save operation asynchronously.
   */
  private async executeSaveScene(): Promise<void> {
    await this.sceneIOHandler.saveScene(this.worldObject, this.statusBar);
  }

  /**
   * Handles the Load Scene toolbar button and Ctrl+O shortcut.
   */
  private onLoadScene(): void {
    void this.executeLoadScene();
  }

  /**
   * Executes the scene load operation asynchronously.
   */
  private async executeLoadScene(): Promise<void> {
    await this.sceneIOHandler.loadScene(
      this.worldObject,
      () => this.onSceneLoaded(),
      this.statusBar
    );
  }

  /**
   * Handles post-load synchronization and UI refresh.
   * Clears selection and undo history because loaded meshes replace the scene.
   */
  private onSceneLoaded(): void {
    this.selectionManager.clearSelection();
    this.faceModeCoordinator.getFaceExtrusionController().clearFaceSelection();
    this.commandStack.clear();
    this.syncPrimitivesToViewports();
    this.refreshOutliner();
    this.shadingModeCoordinator.updateShadingMeshes();
    this.faceModeCoordinator.updateFaceSelectionMeshes();
  }

  /**
   * Handles the Export GLB toolbar button and Ctrl+Shift+E shortcut.
   */
  private onExportGlb(): void {
    void this.executeExportGlb();
  }

  /**
   * Executes the GLB export operation asynchronously.
   */
  private async executeExportGlb(): Promise<void> {
    await this.sceneIOHandler.exportGlb(this.worldObject, this.statusBar);
  }

  /**
   * Handles the undo action from toolbar or keyboard shortcut.
   */
  private onUndo(): void {
    this.onHistoryChange('undo');
  }

  /**
   * Handles the redo action from toolbar or keyboard shortcut.
   */
  private onRedo(): void {
    this.onHistoryChange('redo');
  }

  /**
   * Applies undo or redo and refreshes dependent editor UI state.
   * @param direction Whether to undo or redo the top command.
   */
  private onHistoryChange(direction: 'undo' | 'redo'): void {
    if (direction === 'undo') {
      this.commandStack.undo();
    } else {
      this.commandStack.redo();
    }
    this.pruneInvalidSelectionAfterHistoryChange();
    this.snapSettingsController.rebakeWorldTexturesIfLocked();
    this.syncPrimitivesToViewports();
    this.refreshOutliner();
    this.propertiesPanel.refreshBoundObject();
    this.shadingModeCoordinator.updateShadingMeshes();
    this.faceModeCoordinator.updateFaceSelectionMeshes();
  }

  /**
   * Removes selected meshes that are no longer in the world scene graph.
   */
  private pruneInvalidSelectionAfterHistoryChange(): void {
    this.selectionManager.pruneSelectionNotInScene(this.worldObject);
  }

  /**
   * Syncs world objects to all 2D viewport scenes and restores selection outlines.
   */
  private syncPrimitivesToViewports(): void {
    this.viewportSyncManager.syncWorldObjectToViewports(this.worldObject);
    this.shadingModeCoordinator?.updateShadingMeshes();
    this.selectionVisualController?.reapplyAfterViewportSync();
  }

  /**
   * Creates ResizeObserver-based resize handling for all viewports.
   */
  private watchResize(): void {
    this.resizeObserver = new ResizeObserver(() => this.resizeAll());
    this.viewports.forEach((el) => this.resizeObserver?.observe(el));
    requestAnimationFrame(() => this.resizeAll());
  }

  /**
   * Resizes all viewports to match their container dimensions.
   */
  private resizeAll(): void {
    const allViewports = [
      this.viewport2DTop,
      this.viewport2DFront,
      this.viewport2DSide,
      this.viewport3D
    ];
    allViewports.forEach((vp, index) => {
      const rect = this.viewports[index].getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        vp.resize(rect.width, rect.height);
      }
    });
  }

  /**
   * Starts the render loop and animation frame updates.
   * No-op when already running or after dispose.
   */
  start(): void {
    if (this.isDisposed || this.isRunning) return;
    this.isRunning = true;
    this.lastTime = performance.now();
    this.scheduleNextFrame();
  }

  /**
   * Stops the render loop without disposing resources.
   * Safe to call when not running.
   */
  stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Stops the editor, unregisters global listeners, and releases owned resources.
   * Safe to call more than once.
   */
  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.stop();
    this.disconnectResizeObserver();
    this.keyboardShortcutHandler?.unregister();
    this.inputManager?.dispose();
    this.disposeOwnedUiAndManagers();
  }

  /**
   * Schedules the next animation frame while the editor is running.
   */
  private scheduleNextFrame(): void {
    this.animationFrameId = requestAnimationFrame(() => this.onAnimationFrame());
  }

  /**
   * Advances one frame of viewport updates and rendering.
   */
  private onAnimationFrame(): void {
    if (!this.isRunning || this.isDisposed) {
      this.animationFrameId = null;
      return;
    }
    const now = performance.now();
    const delta = (now - this.lastTime) / 1000;
    this.lastTime = now;
    this.viewport3D.update(delta);
    this.cameraFitCoordinator.updateAnimations();
    this.updateGizmoCameraScale();
    this.clipPlaneHandler?.updatePreviewScales(this.viewport3D.getCamera());
    this.viewport2DTop.render();
    this.viewport2DFront.render();
    this.viewport2DSide.render();
    this.viewport3D.render();
    this.scheduleNextFrame();
  }

  /**
   * Disconnects the viewport resize observer when present.
   */
  private disconnectResizeObserver(): void {
    if (!this.resizeObserver) return;
    this.resizeObserver.disconnect();
    this.resizeObserver = null;
  }

  /**
   * Disposes subsystems that own DOM listeners, GPU helpers, or stacks.
   */
  private disposeOwnedUiAndManagers(): void {
    this.faceModeCoordinator?.getFaceExtrusionController()?.dispose();
    this.selectionVisualController?.dispose();
    this.selectionManager?.dispose();
    this.commandStack?.dispose();
    this.transformGizmo?.dispose();
    this.gizmoRaycaster?.dispose();
    this.primitiveTool?.dispose();
    this.propertiesPanel?.dispose();
    this.outlinerPanel?.dispose();
    this.toolbar?.dispose();
    this.statusBar?.dispose();
    this.uvEditor?.dispose();
    this.textureBrowserController?.dispose();
    this.textureBrowser?.dispose();
    this.toolsPalette?.dispose();
  }

  /**
   * Keeps the transform gizmo a readable size relative to the 3D camera.
   */
  private updateGizmoCameraScale(): void {
    if (this.selectionManager.getSelectedObjectCount() === 0) return;
    this.transformGizmo.updateScaleForCamera(this.viewport3D.getCamera());
    if (this.transformGizmo.getMode() === TransformMode.BOUNDS) {
      const selected = this.selectionManager.getAllSelectedObjectsAsArray();
      this.transformGizmo.updateBoundsFromMeshes(
        selected,
        this.viewport3D.getCamera()
      );
    }
  }

  /**
   * Test/debug helper exposing internal subsystem references.
   * Not part of the public editor API; prefer dedicated accessors if needed.
   * @returns An object containing references to editor subsystems.
   */
  getComponentsForTesting(): object {
    return {
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
      faceExtrusionController:
        this.faceModeCoordinator.getFaceExtrusionController(),
      selectionMode: this.faceModeCoordinator.getSelectionMode()
    };
  }
}
