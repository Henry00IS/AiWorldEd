import * as THREE from 'three';
import { ViewportLayoutCore } from './viewport_layout_core.js';
import { createOutlinerShellActions, createToolbarShellActions } from '@/layout/setup/layout_shell_action_builders.js';
import { buildLayoutShellActionSource } from '@/layout/setup/layout_shell_source.js';
import { createShellSourceHostFromLayout } from '@/layout/setup/layout_manager_hosts.js';
import { onCadRulerTransformFeedback as handleCadRulerTransformFeedback } from '@/layout/setup/bridge_layout_cad_ruler.js';
import { BridgeTransformInteraction } from '@/tools/bridge/bridge_transform_interaction.js';
import { createAndRegisterKeyboardShortcuts } from '@/layout/setup/layout_keyboard_bindings.js';
import { createLayoutToolEditorSystem } from '@/layout/setup/layout_tool_editor_setup.js';
import { setupUvEditorPanel } from '@/texture/layout/layout_uv_editor_setup.js';
import { setupTextureBrowserPanel } from '@/texture/layout/layout_texture_browser_setup.js';
import { TransformSpace } from '@/types/transform_space.js';
import { TransformMode } from '@/types/transform_mode.js';
import { SelectionMode } from '@/types/selection_mode.js';
import { AlignmentAxis } from '@/types/alignment_axis.js';
import {
  applyLayoutTransformSpace,
  updateLayoutGizmoPivot,
  type ContextHelpersLayoutGizmo,
} from '@/layout/setup/helpers_layout_gizmo.js';
import {
  applyLayoutHistoryChange,
  handleLayoutSceneLoaded,
  runLayoutExportGlb,
  runLayoutExportObj,
  runLayoutExportFbx,
  runLayoutNewScene,
  runLayoutVmfImport,
} from '@/layout/setup/layout_scene_io_actions.js';
import { formatKeyboardShortcut } from '@/settings/keyboard/keyboard_shortcut_format.js';
import { createDefaultKeyboardShortcutSettings } from '@/settings/store/settings_defaults.js';
import { applyTransformModeUi } from '@/layout/setup/layout_transform_mode_ui.js';
import { CommandTerrainCreate } from '@/tools/creation/commands/command_terrain_create.js';
import {
  refreshSceneVisualsAfterMutation,
  refreshSceneVisualsAfterTransformCommit,
  type SceneMutationVisualHost,
  type SceneTransformCommitVisualHost,
} from '@/layout/refresh/scene_visual_refresh.js';
import type { Viewport3D } from '@/viewports/core/viewport_3d.js';
import type { Viewport2D } from '@/viewports/core/viewport_2d.js';
import { disposeLayoutOwnedResources } from '@/layout/setup/helpers_layout_dispose.js';
import { buildLayoutTestComponents } from '@/layout/setup/layout_testing_accessors.js';
import { filterUnlockedObjects } from '@/utils/object_lock.js';

/**
 * Root composition manager for the editor viewport layout. Builds UI shell,
 * dynamic viewports, and wires specialized coordinators.
 */
export class ManagerViewportLayout extends ViewportLayoutCore {
  /**
   * Builds outliner action callbacks for the shell builder.
   *
   * @returns Outliner action callback bundle.
   */
  protected createOutlinerActions() {
    return createOutlinerShellActions(buildLayoutShellActionSource(this.getShellSourceHost()));
  }

  /**
   * Builds toolbar action callbacks for the shell builder.
   *
   * @returns Toolbar action callback bundle.
   */
  protected createToolbarShellActionsBundle() {
    return createToolbarShellActions(buildLayoutShellActionSource(this.getShellSourceHost()));
  }

  /**
   * Builds the late-bound shell source host for toolbar and outliner actions.
   *
   * @returns Shell source host with live getters via method closures.
   */
  private getShellSourceHost() {
    const layout = this;
    return createShellSourceHostFromLayout(
      {
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
      },
      {
        refreshOutliner: () => layout.refreshOutliner(),
        refreshAfterWorldMutation: () => layout.refreshAfterWorldMutation(),
        showStatusMessage: (message) => layout.showStatusMessage(message),
        onSelectionChanged: () => layout.onSelectionChanged(),
        onToggleUvEditor: () => layout.onToggleUvEditor(),
        onToggleTextureBrowser: () => layout.onToggleTextureBrowser(),
        onToggleToolsPalette: () => layout.onToggleToolsPalette(),
        onToggleSolidModelPanel: () => layout.onToggleSolidModelPanel(),
        onToggleSettingsDialog: () => layout.onToggleSettingsDialog(),
        onOpenDocumentation: () => layout.onOpenDocumentation(),
        onOpenAboutDialog: () => layout.onOpenAboutDialog(),
        onOpenMcpDialog: () => layout.onOpenMcpDialog(),
        onOpenDetachedViewport: () => layout.onOpenDetachedViewport(),
        onAddTerrain: () => layout.onAddTerrain(),
        onAddSolidModel: () => layout.onAddSolidModel(),
        onUndo: () => layout.onUndo(),
        onRedo: () => layout.onRedo(),
        onDeleteSelected: () => layout.onDeleteSelected(),
        onGroupSelected: () => layout.onGroupSelected(),
        onSetTransformSpaceGlobal: () => layout.onSetTransformSpaceGlobal(),
        onSetTransformSpaceLocal: () => layout.onSetTransformSpaceLocal(),
        isTransformSpaceLocal: () => layout.isTransformSpaceLocal(),
        onNewScene: () => layout.onNewScene(),
        onSaveScene: () => layout.onSaveScene(),
        onLoadScene: () => layout.onLoadScene(),
        onImportVmf: () => layout.onImportVmf(),
        onExportGlb: () => layout.onExportGlb(),
        onExportObj: () => layout.onExportObj(),
        onExportFbx: () => layout.onExportFbx(),
        getShortcutLabel: (action) => layout.getShortcutLabel(action),
      },
    );
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
  protected wireSelectionSystem(): void {
    this.selectionVisualController.wireViewports(this.getAllLiveViewports());
    this.selectionManager.onSelectionChanged(() => this.onSelectionChanged());
  }

  /** Sets up the transform gizmo system and event wiring. */
  protected setupTransformSystem(): void {
    this.transformInteractionBridge = new BridgeTransformInteraction({
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
      getUserSnapEnabled: () => this.userSnapEnabled,
      isTransformSpaceLocal: () => this.transformSpace === TransformSpace.Local,
      onDuplicateSelectedForDrag: () => this.objectActionHandler.onDuplicateSelected(),
      onAfterTransformCommit: (meshes) => this.refreshVisualsAfterTransformCommit(meshes),
      onTransformsLive: (meshes) => this.solidModelController?.onTransformsLive(meshes),
      isInteractionEnabled: () => !this.isFaceSelectionModeActive() && !this.isClipPlaneToolActive(),
      onRulerTransformFeedback: (meshes, phase) => this.onCadRulerTransformFeedback(meshes, phase),
      onPermanentGizmoHandleDragBegan: () => this.toolEditorSystem?.editorWindow.onPermanentGizmoHandleDragBegan(),
      onPermanentGizmoHandleDragEnded: () => this.toolEditorSystem?.editorWindow.onPermanentGizmoHandleDragEnded(),
    });
    this.transformInteractionBridge.setViewportProbe((clientX, clientY) =>
      this.findInteractiveViewportAtClientPoint(
        clientX,
        clientY,
        this.toolEditorSystem?.editorWindow.lastPointerOwnerDocument ?? null,
      ),
    );
    this.wirePropertiesTransformCommit();
  }

  /**
   * Finds an interactive viewport under a client point for editor-driven gizmo
   * and selection picks. Client coordinates are window-local; when
   * ownerDocument is set only panes in that document are considered.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @param ownerDocument Optional document that owns the client coordinates.
   * @returns Viewport, or null.
   */
  private findInteractiveViewportAtClientPoint(
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

  /**
   * Wires the properties inspector so position/rotation/scale edits use the
   * same post-transform visual refresh as gizmo commit and undo/redo.
   */
  private wirePropertiesTransformCommit(): void {
    this.propertiesPanel.setAfterTransformCommit((objects) => {
      this.refreshVisualsAfterTransformCommit(objects);
    });
  }

  /**
   * Shared post-transform visual refresh for inspector fields, gizmo commit,
   * and alignment. Solid CSG finalizes here once — not in
   * {@link refreshAfterWorldMutation} — so structural reclones stay cheap.
   *
   * @param transformedObjects World objects whose local transforms changed.
   */
  protected refreshVisualsAfterTransformCommit(transformedObjects: readonly THREE.Object3D[]): void {
    refreshSceneVisualsAfterTransformCommit(this.getTransformCommitVisualHost(), transformedObjects);
  }

  /**
   * Builds the host bag for transform-commit visual refresh.
   *
   * @returns Scene transform commit visual host.
   */
  private getTransformCommitVisualHost(): SceneTransformCommitVisualHost {
    return {
      syncCloneTransformsForWorldObjects: (objects) =>
        this.viewportSyncManager.syncCloneTransformsForWorldObjects(objects),
      syncSelectionVisualsDuringTransform: () => this.selectionVisualController.syncDuringTransform(),
      syncPrimitivesToViewports: () => this.syncPrimitivesToViewports(),
      ensureWorldMatricesCurrent: () => this.worldObject.updateMatrixWorld(true),
      endCadRulerDrag: () => this.cadRulerSystem.endDrag(),
      refreshCadRulersFromSelection: () => this.refreshCadRulersFromSelection(),
      updateGizmoVisibility: () => this.updateGizmoVisibility(),
      updateGizmoPivot: () => this.updateGizmoPivot(),
      finalizeSolidTransforms: (meshes) => this.solidModelController?.onTransformsCommitted(meshes) === true,
      refreshPropertiesPanel: () => this.propertiesPanel.refreshBoundObject(),
    };
  }

  /** Sets up keyboard shortcuts using the dedicated shortcut handler. */
  protected setupKeyboardShortcuts(): void {
    this.toolEditorSystem = createLayoutToolEditorSystem({
      transformHandler: this.transformHandler,
      transformGizmo: this.transformGizmo,
      selectionManager: this.selectionManager,
      inputManager: this.inputManager,
      getActiveViewport: () => this.resolveActiveInteractiveViewport(),
      getInteractiveViewports: () => this.getAllInteractiveViewports() as ReadonlyArray<Viewport3D | Viewport2D>,
      getLastPointerClientPositionForDocument: (ownerDocument) =>
        this.detachedViewportWindow.getLastPointerClientPositionForDocument(ownerDocument),
      getTransformPivot: () => this.computeGizmoPivotForTools(),
      setStatusMessage: (message) => this.statusBar?.setLastAction(message),
      refreshGizmoPresentation: () => {
        this.updateGizmoVisibility();
        this.updateGizmoPivot();
        this.updateTransformButtons();
      },
      onAfterTransformCommit: (objects) => this.refreshVisualsAfterTransformCommit(objects),
      onTransformsLive: (meshes) => this.solidModelController?.onTransformsLive(meshes),
      onRulerTransformFeedback: (meshes, phase) => this.onCadRulerTransformFeedback(meshes, phase),
      onLiveTransformOverlaySync: (transformTargets, selectedMeshes) => {
        this.syncLiveTransformOverlay(transformTargets, selectedMeshes);
      },
      getTransformInteractionBridge: () => this.transformInteractionBridge ?? null,
      getFaceModeCoordinator: () => this.faceModeCoordinator ?? null,
    });
    this.keyboardShortcutHandler = createAndRegisterKeyboardShortcuts(
      this.inputManager,
      {
        isCameraNavigating: () => this.isEditorNavigationBlockingToolKeys(),
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
        getSolidModelController: () => this.solidModelController,
      },
      () => this.settingsStore?.getKeyboardShortcutSettings() ?? createDefaultKeyboardShortcutSettings(),
    );
    this.toolEditorSystem.setNavigationBlocksActions(() => this.isEditorNavigationBlockingToolKeys());
    this.toolEditorSystem.setGlobalKeyDownHandler((event) => this.keyboardShortcutHandler.handleGlobalKeyDown(event));
    this.keyboardShortcutHandler.setOnToolEventRouterKeyDown((event) => this.toolEditorSystem!.handleKeyDown(event));
    this.transformHandler.setModalStatusTextCallback((text) => {
      if (text.length === 0) return;
      this.statusBar?.setLastAction(text);
    });
  }

  /**
   * Computes the current gizmo pivot for single-use tools from the selection.
   *
   * @returns World pivot point.
   */
  private computeGizmoPivotForTools(): THREE.Vector3 {
    const selected = filterUnlockedObjects(this.selectionManager.getAllSelectedObjectsAsArray());
    return this.transformExecutor.computePivot(selected);
  }

  /**
   * Keeps clones and selection outlines live during transform. Skips gizmo pose
   * updates while single-use is active (gizmos stay hidden like Shape Editor /
   * Blender G/R/S).
   *
   * @param transformTargets Objects receiving pose edits.
   * @param selectedMeshes Current selection meshes.
   */
  private syncLiveTransformOverlay(
    transformTargets: readonly THREE.Object3D[],
    selectedMeshes: readonly THREE.Mesh[],
  ): void {
    this.viewportSyncManager.syncCloneTransformsForWorldObjects(transformTargets);
    this.selectionVisualController.syncDuringTransform();
    if (this.transformHandler.isSingleUseDrag()) {
      return;
    }
    this.syncLiveGizmoPoseDuringPermanentDrag(selectedMeshes);
  }

  /**
   * Updates permanent-mode gizmo pivot and bounds during a live drag.
   *
   * @param selectedMeshes Current selection meshes.
   */
  private syncLiveGizmoPoseDuringPermanentDrag(selectedMeshes: readonly THREE.Mesh[]): void {
    if (this.transformGizmo.getMode() !== TransformMode.ROTATE) {
      this.transformGizmo.setPivot(this.computeGizmoPivotForTools());
    }
    this.transformGizmo.updateBoundsFromMeshes(
      [...selectedMeshes],
      this.resolveActiveInteractiveViewport()?.getCamera() ?? null,
    );
  }

  /**
   * Returns whether camera fly/pan must suppress tool-activation keys (Shape
   * Editor navigation ownership). Continuous WASD still uses ManagerInput.
   *
   * @returns True while RMB fly, MMB pan, or right mouse is held.
   */
  private isEditorNavigationBlockingToolKeys(): boolean {
    if (this.inputManager.isRightMouseDown()) {
      return true;
    }
    return this.getAllInteractiveViewports().some(
      (viewport) => typeof viewport.isCameraNavigating === 'function' && viewport.isCameraNavigating(),
    );
  }

  /**
   * Resolves the interactive viewport under the pointer (hovered/active pane),
   * falling back to the first interactive viewport.
   *
   * @returns Active viewport for single-use projection, or null.
   */
  private resolveActiveInteractiveViewport(): Viewport3D | Viewport2D | null {
    const coordinator = this.shadingModeCoordinator;
    if (coordinator) {
      const hovered = coordinator.getOrderedViewports()[coordinator.getActiveViewportIndex()];
      if (hovered) {
        return hovered as Viewport3D | Viewport2D;
      }
    }
    const active = this.getActiveViewports()[0];
    if (active) {
      return active as Viewport3D | Viewport2D;
    }
    return (this.getAllInteractiveViewports()[0] as Viewport3D | Viewport2D | undefined) ?? null;
  }

  /** Creates the floating UV editor panel and controller. */
  protected setupUvEditor(): void {
    const result = setupUvEditorPanel({
      selectionManager: this.selectionManager,
      faceController: this.faceModeCoordinator.getFaceExtrusionController(),
      commandStack: this.commandStack,
      toolbarContainer: this.toolbarContainer,
      getViewports: () => this.getAllLiveViewports(),
      statusBar: this.statusBar,
      afterSurfaceChange: () => this.refreshShadingAfterSurfaceEdit(),
    });
    this.uvEditor = result.uvEditor;
    this.uvEditorController = result.uvEditorController;
  }

  /** Toggles the UV editor panel. */
  protected onToggleUvEditor(): void {
    this.uvEditor?.toggle();
    if (this.uvEditor?.isOpen()) {
      this.uvEditorController?.refreshFromSelection();
      this.statusBar?.setLastAction('UV Editor opened');
    }
  }

  /** Creates the floating texture browser, library wiring, and assignment. */
  protected setupTextureBrowser(): void {
    const result = setupTextureBrowserPanel({
      selectionManager: this.selectionManager,
      faceController: this.faceModeCoordinator.getFaceExtrusionController(),
      commandStack: this.commandStack,
      toolbarContainer: this.toolbarContainer,
      getViewports: () => this.getAllLiveViewports(),
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
    this.modalToolSessionRegistry.onSelectionChanged();
    this.updateGizmoVisibility();
    this.updateGizmoPivot();
    this.uvEditorController?.refreshFromSelection();
    this.refreshCadRulersFromSelection();
  }

  /**
   * Drives CAD ghost bounds and delta rulers during transform interaction.
   *
   * @param meshes Selected meshes involved in the transform.
   * @param phase Drag lifecycle phase.
   */
  private onCadRulerTransformFeedback(meshes: THREE.Mesh[], phase: 'begin' | 'move' | 'end'): void {
    handleCadRulerTransformFeedback(this.getCadRulerHost(), meshes, phase);
  }

  /**
   * Returns whether face selection mode is currently active.
   *
   * @returns True when the editor is in face selection mode.
   */
  protected isFaceSelectionModeActive(): boolean {
    if (!this.faceModeCoordinator) return false;
    return this.faceModeCoordinator.getSelectionMode() === SelectionMode.FACE;
  }

  /**
   * Returns whether the clip plane tool is currently active.
   *
   * @returns True when clip placement is live.
   */
  protected isClipPlaneToolActive(): boolean {
    if (this.toolEditorSystem?.isClipToolActive()) {
      return true;
    }
    return this.clipPlaneTool.isActive();
  }

  /** Updates the gizmo pivot to the selection center. */
  protected updateGizmoPivot(): void {
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
  private getGizmoContext(): ContextHelpersLayoutGizmo {
    return {
      selectionManager: this.selectionManager,
      transformGizmo: this.transformGizmo,
      transformExecutor: this.transformExecutor,
      transformSpace: this.transformSpace,
      getGizmoScaleCamera: () => this.resolveGizmoScaleCamera(),
      toolbar: this.toolbar,
      showStatusMessage: (message) => this.showStatusMessage(message),
    };
  }

  /**
   * Picks a camera for constant on-screen gizmo sizing. Prefer perspective when
   * any pane still has it; otherwise use an active or live orthographic view so
   * 2D-only startups still scale translate/rotate/scale handles.
   *
   * @returns Camera for gizmo scale, or null when no viewports exist.
   */
  private resolveGizmoScaleCamera(): THREE.Camera | null {
    const perspective = this.getPrimaryPerspectiveViewport();
    if (perspective) return perspective.getCamera();
    const active = this.getActiveViewports()[0];
    if (active) return active.getCamera();
    return this.getAllLiveViewports()[0]?.getCamera() ?? null;
  }

  /** Refreshes the outliner panel from the live world hierarchy. */
  protected refreshOutliner(): void {
    this.outlinerPanel.refresh();
  }

  /** Handles post-primitive-creation synchronization and UI refresh. */
  protected onPrimitiveCreated(): void {
    this.refreshAfterWorldMutation();
  }

  /** Creates a procedural terrain mesh and selects it. */
  private onAddTerrain(): void {
    const mesh = this.terrainGenerator.createTerrain(20, 20, 32, 2.5, Date.now() % 1000);
    this.commandStack.push(new CommandTerrainCreate(mesh, this.worldObject));
    this.selectionManager.selectObject(mesh);
    this.refreshAfterWorldMutation();
    this.showStatusMessage(`Created ${mesh.name}`);
  }

  /**
   * Updates the status bar axis restriction display.
   *
   * @param axis The active alignment axis restriction.
   */
  /**
   * Alignment axis cycling was removed; keep the hook for the layout core
   * contract without status-bar feedback.
   *
   * @param _axis Unused axis value.
   */
  protected onAxisRestrictionChanged(_axis: AlignmentAxis): void {}

  /**
   * Displays a message in the status bar.
   *
   * @param message The message text to display.
   */
  protected showStatusMessage(message: string): void {
    this.statusBar?.setLastAction(message);
  }

  /**
   * Handles transform mode change from toolbar or keyboard.
   *
   * @param mode The new transform mode to activate.
   */
  protected onTransformMode(mode: TransformMode): void {
    if (this.toolEditorSystem) {
      if (!this.toolEditorSystem.switchToTransformMode(mode)) {
        return;
      }
    } else {
      this.transformGizmo.setMode(mode);
      this.updateGizmoPivot();
    }
    this.updateTransformButtons();
  }

  /** Updates tools palette transform highlights and status bar mode text. */
  protected updateTransformButtons(): void {
    applyTransformModeUi(this.toolsPalette, this.statusBar, this.transformGizmo.getMode());
  }

  /** Handles File → New: confirms discard, then restores the startup cube. */
  private onNewScene(): void {
    void runLayoutNewScene(
      this.toolbarContainer,
      this.sceneIOHandler,
      this.worldObject,
      this.commandStack,
      this.statusBar,
      this.solidModelController,
      () => this.onSceneLoaded(),
    );
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
    });
  }

  /** Handles the Export GLB toolbar button and Ctrl+Shift+E shortcut. */
  private onExportGlb(): void {
    runLayoutExportGlb(this.sceneIOHandler, this.worldObject, this.statusBar);
  }

  /** Handles File → Export → Wavefront OBJ. */
  private onExportObj(): void {
    this.ensureSettingsSystem();
    const profile = this.settingsStore?.getActiveGameProfile() ?? null;
    runLayoutExportObj(this.sceneIOHandler, this.worldObject, this.statusBar, profile);
  }

  /** Handles File → Export → Autodesk FBX. */
  private onExportFbx(): void {
    this.ensureSettingsSystem();
    const profile = this.settingsStore?.getActiveGameProfile() ?? null;
    runLayoutExportFbx(this.sceneIOHandler, this.worldObject, this.statusBar, profile);
  }

  /** Handles File → Import VMF: picks a map and places a solid model. */
  private onImportVmf(): void {
    void runLayoutVmfImport(this.sceneIOHandler, this.statusBar, this.solidModelController, () =>
      this.refreshAfterWorldMutation(),
    );
  }

  /**
   * Resolves a configured keyboard shortcut label for File menu display.
   *
   * @param action Save, load, or export_glb action id.
   * @returns Shortcut text such as "Ctrl+S".
   */
  private getShortcutLabel(action: 'save' | 'load' | 'export_glb'): string {
    const defaults = createDefaultKeyboardShortcutSettings();
    const settings = this.settingsStore?.getKeyboardShortcutSettings() ?? defaults;
    return formatKeyboardShortcut(settings[action]);
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
      },
      direction,
    );
  }

  /**
   * Syncs viewports, outliner, shading, face selection, CAD rulers, and gizmo
   * after world changes. Single contract shared with inspector transforms and
   * history so overlays cannot desync from object poses.
   */
  protected refreshAfterWorldMutation(): void {
    refreshSceneVisualsAfterMutation(this.getMutationVisualHost());
  }

  /**
   * Builds the host bag for full world-mutation visual refresh.
   *
   * @returns Scene mutation visual host.
   */
  private getMutationVisualHost(): SceneMutationVisualHost {
    return {
      syncPrimitivesToViewports: () => this.syncPrimitivesToViewports(),
      refreshOutliner: () => this.refreshOutliner(),
      updateFaceSelectionMeshes: () => this.faceModeCoordinator.updateFaceSelectionMeshes(),
      ensureWorldMatricesCurrent: () => this.worldObject.updateMatrixWorld(true),
      endCadRulerDrag: () => this.cadRulerSystem.endDrag(),
      refreshCadRulersFromSelection: () => this.refreshCadRulersFromSelection(),
      updateGizmoVisibility: () => this.updateGizmoVisibility(),
      updateGizmoPivot: () => this.updateGizmoPivot(),
      refreshPropertiesPanel: () => this.propertiesPanel.refreshBoundObject(),
    };
  }

  /**
   * Syncs world objects to all 2D viewport scenes and restores selection
   * outlines. Shading refresh runs once here so callers avoid a second full
   * mesh walk.
   */
  protected syncPrimitivesToViewports(): void {
    this.viewportSyncManager.syncWorldObjectToViewports(this.worldObject);
    this.shadingModeCoordinator?.updateShadingMeshes();
    this.selectionVisualController?.reapplyAfterViewportSync();
  }

  /** Binds the shared render loop to live viewports and coordinators. */
  protected bindRenderLoop(): void {
    this.renderLoop.bind({
      getActiveViewports: () => this.getActiveViewports(),
      cameraFitCoordinator: this.cameraFitCoordinator,
      clipPlaneHandler: this.clipPlaneHandler,
      cadRulerSystem: this.cadRulerSystem,
      transformGizmo: this.transformGizmo,
      transformHandler: this.transformHandler,
      onBeforeRender: () => {
        this.cadRulerSystem.refreshLabelProjection();
        this.toolEditorSystem?.editorWindow.onRepaint();
      },
      multiViewComposer: this.multiViewComposer,
      sharedScene: this.sharedWorldScene,
    });
  }

  /** Creates ResizeObserver-based resize handling for workspace and panes. */
  protected watchResize(): void {
    const elements = [this.viewportArea, ...this.viewportRegistry.getContainers()];
    this.renderLoop.watchResize(elements, () => this.resizeAll());
    requestAnimationFrame(() => this.resizeAll());
  }

  /** Resizes the shared surface and every active pane camera. */
  protected resizeAll(): void {
    this.viewportPaneLayout.getAreaLayoutController().snapGeometryToPixels();
    const width = this.viewportArea.clientWidth;
    const height = this.viewportArea.clientHeight;
    if (width > 0 && height > 0) {
      this.sharedSurface.resize(width, height);
    }
    this.viewportRegistry.getPanes().forEach((pane) => {
      const viewport = pane.getViewport();
      if (!viewport || !pane.isActive()) return;
      const rect = viewport.getContentElement().getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        viewport.resize(Math.max(1, Math.floor(rect.width)), Math.max(1, Math.floor(rect.height)));
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
    this.toolEditorSystem?.uninstallFocusPointerRouter();
    this.inputManager?.dispose();
    this.viewportRegistry?.dispose();
    this.sharedSurface?.dispose();
    this.areaLayoutInteraction?.dispose();
    this.areaLayoutInteraction = null;
    this.workspaceSwitcherBar?.dispose();
    this.workspaceSwitcherBar = null;
    this.workspaceController = null;
    this.detachedViewportWindow?.dispose();
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
