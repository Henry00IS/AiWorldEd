import * as THREE from 'three';
import { TransformMode } from '@/types/transform_mode.js';
import { HandlerTransform } from '@/transform/core/handler_transform.js';
import { GizmoTransform } from '@/transform/gizmo/gizmo_transform.js';
import type { GridSnap } from '@/transform/snap/grid_snap.js';
import {
  applyGridSnapPrecisionFromShift,
  restoreGridSnapUserPreference,
} from '@/transform/snap/grid_snap_shift_precision.js';
import { ManagerInput } from '@/input/manager_input.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { filterUnlockedObjects } from '@/utils/object_lock.js';
import { resolveTransformTargets } from '@/selection/object/resolve_transform_targets.js';
import { EditorWindow } from '@/editor/window/editor_window.js';
import { EditorInputBridge } from '@/editor/window/editor_input_bridge.js';
import type { EditorServices } from '@/editor/window/editor_services.js';
import { GuiWindow } from '@/editor/gui/gui_window.js';
import type { ISelectable } from '@/editor/i_selectable.js';
import { ClipTool } from '@/editor/tools/clip_tool.js';
import type { ToolClipPlane } from '@/tools/clip_plane/tool_clip_plane.js';
import type { HandlerClipPlane } from '@/tools/clip_plane/handler_clip_plane.js';
import type { Viewport3D } from '@/viewports/core/viewport_3d.js';
import type { Viewport2D } from '@/viewports/core/viewport_2d.js';
import { isPerspectiveViewportKind } from '@/viewports/core/viewport_kind.js';
import { keyboardShortcutCodeFromEvent } from '@/input/keyboard_event_match.js';
import { SelectionClickThrough } from '@/selection/object/selection_click_through.js';
import { orderObjectPickStackForViewport } from '@/selection/object/selection_pick_order_2d.js';
import type { BridgeTransformInteraction } from '@/tools/bridge/bridge_transform_interaction.js';
import type { CoordinatorFaceMode } from '@/tools/face/coordinator_face_mode.js';
import type { CoordinatorEditMode } from '@/edit/coordinator/coordinator_edit_mode.js';
import type { HandlerComponentTransform } from '@/edit/transform/handler_component_transform.js';
import { BridgeComponentTransformInteraction } from '@/edit/transform/bridge_component_transform_interaction.js';
import {
  computeComponentTransformPivot,
  expandComponentSelectionToTransformVertices,
} from '@/edit/transform/component_transform_selection.js';
import {
  publishLayoutTransformLiveVisuals,
  shouldPublishLiveVisualsAfterModalKey,
} from './layout_transform_live_visuals.js';
import { audioViewportFocus } from '@/audio/spatial/audio_viewport_focus.js';
import {
  isAltPressedOnDomFlags,
  isAltPressedOnInputManagers,
  isAnyModifierPressedOnDomFlags,
  isAnyModifierPressedOnInputManagers,
  isCtrlOrMetaPressedOnDomFlags,
  isCtrlOrMetaPressedOnInputManagers,
  isShiftPressedOnDomFlags,
  isShiftPressedOnInputManagers,
  type DomModifierKeyFlags,
} from '@/input/modifier_keys_query.js';
import { findPickSurfaceAtClientPoint } from '@/utils/pointer_client_hit.js';

/** Dependencies for building the Shape Editor-style tool stack. */
export interface LayoutToolEditorSetupDeps {
  transformHandler: HandlerTransform;
  componentTransformHandler: HandlerComponentTransform;
  transformGizmo: GizmoTransform;
  selectionManager: ManagerSelection;
  inputManager: ManagerInput;
  /** Live grid snap used by transform math (Shift precision mode mutates this). */
  gridSnap: GridSnap;
  /**
   * Returns the user's snap preference independent of temporary Shift
   * precision.
   *
   * @returns True when the user wants snap enabled.
   */
  getUserSnapEnabled: () => boolean;
  getActiveViewport: () => Viewport3D | Viewport2D | null;
  /**
   * All interactive panes (2D + 3D, including detached). Used so tools can
   * resolve camera/pick from the pane under the pointer.
   */
  getInteractiveViewports: () => ReadonlyArray<Viewport3D | Viewport2D>;
  getTransformPivot: () => THREE.Vector3;
  setStatusMessage: (message: string) => void;
  refreshGizmoPresentation: () => void;
  onAfterTransformCommit: (objects: THREE.Object3D[]) => void;
  onTransformsLive?: (meshes: THREE.Mesh[]) => void;
  onRulerTransformFeedback?: (meshes: THREE.Mesh[], phase: 'begin' | 'move' | 'end') => void;
  /**
   * Keeps selection outlines and gizmo glued during live single-use moves (same
   * contract as gizmo pointer-move).
   *
   * @param transformTargets Objects receiving pose edits.
   * @param selectedMeshes Current selection meshes (solid live CSG keys off
   *   these).
   */
  onLiveTransformOverlaySync?: (
    transformTargets: readonly THREE.Object3D[],
    selectedMeshes: readonly THREE.Mesh[],
  ) => void;
  /**
   * Editor-global shortcut fallthrough (undo, file, tool SwitchTool map).
   *
   * @param event Browser keyboard event.
   * @returns True when handled.
   */
  handleGlobalKeyDown?: (event: KeyboardEvent) => boolean;
  /**
   * Returns whether camera navigation must suppress tool activation keys.
   *
   * @returns True while fly/pan owns continuous motion keys.
   */
  isNavigationBlockingTools?: () => boolean;
  /**
   * Returns the last pointer client position for a detached (or other)
   * document. Main-document samples use {@link inputManager} instead.
   *
   * @param ownerDocument Document that owns the pointer sample.
   * @returns Client coordinates, or null when unknown.
   */
  getLastPointerClientPositionForDocument?: (ownerDocument: Document) => { clientX: number; clientY: number } | null;
  /**
   * Returns input managers for open detached popups so Shift/Ctrl multi-select
   * sees keys held in those windows (main uses {@link inputManager}).
   *
   * @returns Detached popup input managers.
   */
  getDetachedInputManagers?: () => readonly ManagerInput[];
  /**
   * Permanent gizmo interaction bridge (widget-driven; no viewport callbacks).
   *
   * @returns Bridge instance when the transform system exists.
   */
  getTransformInteractionBridge?: () => BridgeTransformInteraction | null;
  /**
   * Face mode coordinator for FaceSelectTool mouse routing.
   *
   * @returns Coordinator when face mode is set up.
   */
  getFaceModeCoordinator?: () => CoordinatorFaceMode | null;
  /**
   * Edit Mode coordinator for EditSelectTool mouse routing.
   *
   * @returns Coordinator when edit mode is set up.
   */
  getEditModeCoordinator?: () => CoordinatorEditMode | null;
  /**
   * Grid orientation handler for GridTool face-align picks.
   *
   * @returns Handler when grid tools are set up.
   */
  getGridOrientationHandler?: () => import('@/tools/grid/handler_grid_orientation.js').HandlerGridOrientation | null;
  /**
   * Called when a permanent gizmo handle drag begins so widgets latch
   * wantsActive.
   */
  onPermanentGizmoHandleDragBegan?: () => void;
  /**
   * Called when a permanent gizmo handle drag ends so widgets clear
   * wantsActive.
   */
  onPermanentGizmoHandleDragEnded?: () => void;
}

/** Built tool system exposed to the layout for keyboard and mode switches. */
export interface LayoutToolEditorSystem {
  editorWindow: EditorWindow;
  inputBridge: EditorInputBridge;
  /**
   * Toolbar / permanent mode switch (Shape Editor SwitchTool).
   *
   * @param mode Transform mode.
   * @returns True when the permanent tool is active.
   */
  switchToTransformMode: (mode: TransformMode) => boolean;
  /**
   * Returns to the default object-select tool.
   *
   * @returns True when object-select is active.
   */
  switchToObjectSelect: () => boolean;
  /**
   * Switches to the face select tool.
   *
   * @returns True when face-select is active.
   */
  switchToFaceSelect: () => boolean;
  /**
   * Switches to the Edit Mode select tool.
   *
   * @returns True when edit-select is active.
   */
  switchToEditSelect: () => boolean;
  /**
   * Switches to the grid orientation tool.
   *
   * @returns True when grid tool is active.
   */
  switchToGridTool: () => boolean;
  /** Re-pins exclusive routing roots to every interactive pane content element. */
  refreshInteractiveViewportDomain: () => void;
  /**
   * Cancels an active single-use tool if one is running.
   *
   * @returns True when a single-use tool was cancelled.
   */
  cancelActiveSingleUseTool: () => boolean;
  /**
   * Returns whether the active tool is busy (exclusive input).
   *
   * @returns True while a tool must keep focus.
   */
  isToolBusy: () => boolean;
  /**
   * Returns whether the focused event receiver is busy (Shape Editor
   * exclusive).
   *
   * @returns True while focus cannot leave the current receiver.
   */
  isActiveEventReceiverBusy: () => boolean;
  /**
   * Registers a floating tool window with the focus system.
   *
   * @param rootElement Panel root element.
   * @param surfaceId Stable surface id.
   */
  registerGuiSurface: (rootElement: HTMLElement, surfaceId: string) => void;
  /**
   * Unregisters a floating tool window from the focus system.
   *
   * @param rootElement Panel root element.
   */
  unregisterGuiSurface: (rootElement: HTMLElement) => void;
  /**
   * Installs capture-phase focus pointer routing on the editor host.
   *
   * @param hostElement Element that contains floating panels.
   */
  installFocusPointerRouter: (hostElement: HTMLElement) => void;
  /** Removes the capture-phase focus pointer router. */
  uninstallFocusPointerRouter: () => void;
  /**
   * Shape Editor OnKeyDown entry for the keyboard shortcut handler.
   *
   * @param event Browser keyboard event.
   * @returns True when consumed.
   */
  handleKeyDown: (event: KeyboardEvent) => boolean;
  /**
   * Sets the global keydown fallthrough (after tools).
   *
   * @param handler Global shortcut handler.
   */
  setGlobalKeyDownHandler: (handler: (event: KeyboardEvent) => boolean) => void;
  /**
   * Sets whether camera navigation suppresses tool keys.
   *
   * @param callback Returns true while navigation blocks tools.
   */
  setNavigationBlocksActions: (callback: () => boolean) => void;
  /**
   * Registers the clip plane tool with the editor window after the handler
   * exists.
   *
   * @param placement Clip placement model.
   * @param handler Clip interaction handler.
   * @returns Registered clip tool.
   */
  registerClipTool: (placement: ToolClipPlane, handler: HandlerClipPlane) => ClipTool;
  /**
   * Switches to the clip plane tool.
   *
   * @returns True when the clip tool is active.
   */
  switchToClipTool: () => boolean;
  /**
   * Returns whether the clip tool is the active editor tool.
   *
   * @returns True while clipping.
   */
  isClipToolActive: () => boolean;
}

/**
 * Creates an editor window and EditorInputBridge, wires services and exclusive
 * viewport roots, and returns tool-system handles.
 *
 * @param deps Layout services and callbacks for constructing the tool stack.
 * @returns Tool system handles.
 */
export function createLayoutToolEditorSystem(deps: LayoutToolEditorSetupDeps): LayoutToolEditorSystem {
  const editorWindow = new EditorWindow();
  const inputBridge = new EditorInputBridge(editorWindow);
  let globalKeyDown: ((event: KeyboardEvent) => boolean) | null = deps.handleGlobalKeyDown ?? null;
  let navigationBlocks: (() => boolean) | null = deps.isNavigationBlockingTools ?? null;
  const services = createEditorServices(
    deps,
    () => globalKeyDown,
    () => navigationBlocks,
    inputBridge,
    () => editorWindow.lastPointerOwnerDocument,
    () => editorWindow.getLatchedModifierFlags(),
  );
  editorWindow.setServices(services);
  editorWindow.validateTools();
  wireAfterDragVisualRefresh(deps);
  const refreshInteractiveViewportDomain = (): void => {
    syncAudioViewportContentRegistry(deps);
    inputBridge.setExclusiveViewportRoots(collectInteractivePickElements(deps));
  };
  inputBridge.setExclusiveRootHitListener((root) => {
    audioViewportFocus.recordFromContentElement(root);
  });
  refreshInteractiveViewportDomain();
  return {
    editorWindow,
    inputBridge,
    switchToTransformMode: (mode) => switchPermanentTransformMode(editorWindow, mode),
    switchToObjectSelect: () => {
      editorWindow.userSwitchToBoundsTool();
      return true;
    },
    switchToFaceSelect: () => {
      editorWindow.userSwitchToFaceSelectTool();
      return true;
    },
    switchToEditSelect: () => {
      editorWindow.userSwitchToEditSelectTool();
      return true;
    },
    switchToGridTool: () => {
      editorWindow.userSwitchToGridTool();
      return true;
    },
    refreshInteractiveViewportDomain,
    cancelActiveSingleUseTool: () => cancelActiveSingleUseTool(editorWindow),
    isToolBusy: () => editorWindow.isToolBusy,
    isActiveEventReceiverBusy: () => editorWindow.isActiveEventReceiverBusy,
    registerGuiSurface: (rootElement, surfaceId) => {
      editorWindow.registerGuiWindow(new GuiWindow(rootElement, surfaceId));
    },
    unregisterGuiSurface: (rootElement) => {
      editorWindow.unregisterGuiWindowByRoot(rootElement);
    },
    installFocusPointerRouter: (hostElement) => {
      inputBridge.install(hostElement);
      refreshInteractiveViewportDomain();
    },
    uninstallFocusPointerRouter: () => {
      inputBridge.uninstall();
    },
    handleKeyDown: (event) => {
      const keyCode = keyboardShortcutCodeFromEvent(event);
      return editorWindow.onKeyDown(keyCode, event);
    },
    setGlobalKeyDownHandler: (handler) => {
      globalKeyDown = handler;
    },
    setNavigationBlocksActions: (callback) => {
      navigationBlocks = callback;
    },
    registerClipTool: (placement, handler) => {
      const clipTool = new ClipTool(placement, handler);
      editorWindow.setClipTool(clipTool);
      return clipTool;
    },
    switchToClipTool: () => editorWindow.userSwitchToClipTool(),
    isClipToolActive: () => editorWindow.isClipToolActive(),
  };
}

/**
 * Switches to a permanent transform tool (toolbar SwitchTool).
 *
 * @param editorWindow Editor window.
 * @param mode Transform mode.
 * @returns True when switched.
 */
function switchPermanentTransformMode(editorWindow: EditorWindow, mode: TransformMode): boolean {
  if (mode === TransformMode.TRANSLATE) {
    editorWindow.userSwitchToTranslateTool();
    return true;
  }
  if (mode === TransformMode.ROTATE) {
    editorWindow.userSwitchToRotateTool();
    return true;
  }
  if (mode === TransformMode.SCALE) {
    editorWindow.userSwitchToScaleTool();
    return true;
  }
  if (mode === TransformMode.BOUNDS) {
    editorWindow.userSwitchToBoundsTool();
    return true;
  }
  editorWindow.userSwitchToBoundsTool();
  return true;
}

/**
 * Cancels the active single-use tool when one is running (Shape Editor Escape).
 *
 * @param editorWindow Editor window.
 * @returns True when a single-use tool was cancelled.
 */
function cancelActiveSingleUseTool(editorWindow: EditorWindow): boolean {
  const active = editorWindow.activeTool;
  if (!active || !active.isSingleUse) {
    return false;
  }
  active.onKeyDown('Escape');
  return true;
}

/**
 * Builds map-editor services for EditorWindow tools and widgets.
 *
 * @param deps Layout services.
 * @param getGlobalKeyDown Global keydown fallthrough getter.
 * @param getNavigationBlocks Navigation block getter.
 * @param inputBridge Input bridge for exclusive viewport root.
 * @param getPointerOwnerDocument Document that owns the last pointer sample.
 * @param getLatchedModifierFlags Bridge-latched DOM modifiers from the last
 *   sample.
 * @returns Services implementation.
 */
function createEditorServices(
  deps: LayoutToolEditorSetupDeps,
  getGlobalKeyDown: () => ((event: KeyboardEvent) => boolean) | null,
  getNavigationBlocks: () => (() => boolean) | null,
  inputBridge: EditorInputBridge,
  getPointerOwnerDocument: () => Document | null,
  getLatchedModifierFlags: () => DomModifierKeyFlags | null,
): EditorServices {
  const selectableCache = new Map<THREE.Object3D, ISelectable>();
  const componentTransformBridge = createComponentTransformBridge(deps, getPointerOwnerDocument);
  return {
    getTransformTargets: () => {
      const selected = filterUnlockedObjects(deps.selectionManager.getAllSelectedObjectsAsArray());
      return resolveTransformTargets(selected, deps.selectionManager.getInspectorObjects());
    },
    forEachSelectedObject: () =>
      iterateSelectables(filterUnlockedObjects(deps.selectionManager.getAllSelectedObjectsAsArray()), selectableCache),
    getSelectedCount: () => resolveEditorSelectedCount(deps),
    getTransformPivot: () => resolveEditorTransformPivot(deps),
    getSelectedSegmentsAveragePosition: () => resolveAverageScreenPosition(deps),
    isSnapping: () => false,
    getGridSnap: () => 1,
    getAngleSnap: () => 15,
    screenPointToGrid: (screenX, screenY) => ({ x: screenX, y: screenY }),
    gridPointToScreen: (gridX, gridY) => ({ x: gridX, y: gridY }),
    getActiveCamera: () => deps.getActiveViewport()?.getCamera() ?? null,
    getActivePickElement: () => deps.getActiveViewport()?.getContentElement() ?? null,
    resolveInteractiveViewportAtClientPoint: (clientX, clientY, ownerDocument) =>
      resolveInteractiveViewportAtClientPoint(deps, clientX, clientY, ownerDocument),
    resolveFirstInteractiveViewportInDocument: (ownerDocument) =>
      resolveFirstInteractiveViewportInDocument(deps, ownerDocument),
    getInteractiveViewportPickElements: () => collectInteractivePickElements(deps),
    beginSingleUseDrag: (mode, objects, pivot, camera, pickElement, clientX, clientY) => {
      if (tryBeginComponentSingleUseDrag(deps, mode, camera, pickElement, clientX, clientY)) {
        deps.transformGizmo.setVisible(false);
        inputBridge.setExclusiveViewportRoots(collectInteractivePickElements(deps));
        return true;
      }
      return beginSingleUseDragHiddenGizmo(
        deps,
        inputBridge,
        mode,
        objects,
        pivot,
        camera,
        pickElement,
        clientX,
        clientY,
      );
    },
    applySingleUsePointerMove: (clientX, clientY, camera, pickElement) => {
      if (deps.componentTransformHandler.isDragging()) {
        deps.componentTransformHandler.applyPointerMove(clientX, clientY);
        deps.getEditModeCoordinator?.()?.refreshPresentation();
        return;
      }
      applySingleUsePointerMove(deps, clientX, clientY, camera, pickElement);
    },
    isTransformDragActive: () => deps.transformHandler.isDragging() || deps.componentTransformHandler.isDragging(),
    isPermanentGizmoHandleDragActive: () =>
      (deps.transformHandler.isDragging() && !deps.transformHandler.isSingleUseDrag()) ||
      deps.componentTransformHandler.isPermanentDrag() ||
      componentTransformBridge.isPermanentDragActive(),
    handleModalKeyDown: (_keyCode, event) => handleModalKeyDownWithLiveVisuals(deps, event),
    commitActiveTransformDrag: () => {
      if (deps.componentTransformHandler.isDragging()) {
        deps.componentTransformHandler.commitIfNeeded();
        restoreSingleUseSnapUserPreference(deps);
        inputBridge.setExclusiveViewportRoots(collectInteractivePickElements(deps));
        deps.refreshGizmoPresentation();
        return;
      }
      deps.transformHandler.commitActiveDragIfNeeded();
      restoreSingleUseSnapUserPreference(deps);
      inputBridge.setExclusiveViewportRoots(collectInteractivePickElements(deps));
      deps.refreshGizmoPresentation();
    },
    cancelActiveTransformDrag: () => {
      if (deps.componentTransformHandler.isDragging()) {
        deps.componentTransformHandler.cancelIfNeeded();
        restoreSingleUseSnapUserPreference(deps);
        inputBridge.setExclusiveViewportRoots(collectInteractivePickElements(deps));
        deps.refreshGizmoPresentation();
        return;
      }
      deps.transformHandler.cancelActiveDragIfNeeded();
      restoreSingleUseSnapUserPreference(deps);
      inputBridge.setExclusiveViewportRoots(collectInteractivePickElements(deps));
      deps.refreshGizmoPresentation();
    },
    pinExclusiveViewportDomain: (pickElements) => {
      inputBridge.setExclusiveViewportRoots(pickElements);
    },
    pinExclusiveViewport: (pickElement) => {
      if (pickElement === undefined || pickElement === null) {
        inputBridge.setExclusiveViewportRoots(collectInteractivePickElements(deps));
        return;
      }
      inputBridge.setExclusiveViewportRoot(pickElement);
    },
    clearExclusiveViewport: () => {
      inputBridge.setExclusiveViewportRoots(collectInteractivePickElements(deps));
    },
    pickObjectStackAtClientPoint: (clientX, clientY) =>
      pickObjectStackAtClientPoint(deps, clientX, clientY, null, getPointerOwnerDocument()),
    clearObjectSelection: () => {
      if (deps.getEditModeCoordinator?.()?.isActive() === true) {
        return;
      }
      deps.selectionManager.clearSelection();
    },
    applyObjectClickSelectionAtClientPoint: (clientX, clientY, additive, toggle) => {
      if (deps.getEditModeCoordinator?.()?.isActive() === true) {
        return;
      }
      applyObjectClickSelectionAtClientPoint(deps, clientX, clientY, additive, toggle, getPointerOwnerDocument());
    },
    applyObjectMarqueeSelection: (clientMinX, clientMinY, clientMaxX, clientMaxY, subtractive) => {
      if (deps.getEditModeCoordinator?.()?.isActive() === true) {
        return;
      }
      applyObjectMarqueeSelection(
        deps,
        clientMinX,
        clientMinY,
        clientMaxX,
        clientMaxY,
        subtractive,
        getPointerOwnerDocument(),
      );
    },
    tryBeginPermanentGizmoDragFromEditorPointer: (clientX, clientY, modifiers) => {
      if (deps.getEditModeCoordinator?.()?.isActive() === true) {
        return componentTransformBridge.tryBeginFromEditorPointer(clientX, clientY, modifiers);
      }
      const bridge = deps.getTransformInteractionBridge?.() ?? null;
      if (!bridge) {
        return false;
      }
      return bridge.tryBeginFromEditorPointer(clientX, clientY, modifiers);
    },
    probePermanentGizmoUnderPointer: (clientX, clientY, modifiers) => {
      if (deps.getEditModeCoordinator?.()?.isActive() === true) {
        return componentTransformBridge.probeGizmoUnderPointer(clientX, clientY, modifiers);
      }
      const bridge = deps.getTransformInteractionBridge?.() ?? null;
      if (!bridge) {
        return false;
      }
      return bridge.probeGizmoUnderPointer(clientX, clientY, modifiers);
    },
    updateBoundsHoverAtClientPoint: (clientX, clientY) => {
      const bridge = deps.getTransformInteractionBridge?.() ?? null;
      if (!bridge) {
        return;
      }
      if (deps.getEditModeCoordinator?.()?.isActive() === true) {
        bridge.clearBoundsHover();
        return;
      }
      bridge.updateBoundsHoverAtClientPoint(clientX, clientY);
    },
    clearBoundsHoverAtClientPoint: () => {
      const bridge = deps.getTransformInteractionBridge?.() ?? null;
      if (!bridge) {
        return;
      }
      bridge.clearBoundsHover();
    },
    enterFaceSelectionMode: () => {
      deps.getFaceModeCoordinator?.()?.enterFaceSelectionModeFromTool();
    },
    leaveFaceSelectionMode: () => {
      deps.getFaceModeCoordinator?.()?.leaveFaceSelectionModeFromTool();
    },
    beginFaceSelectPointerDown: (clientX, clientY, isShiftPressed, isCtrlPressed) => {
      return (
        deps
          .getFaceModeCoordinator?.()
          ?.beginFaceSelectPointerDown(clientX, clientY, isShiftPressed, isCtrlPressed, getPointerOwnerDocument()) ===
        true
      );
    },
    continueFaceSelectPointerMove: (clientX, clientY, buttons) => {
      deps.getFaceModeCoordinator?.()?.continueFaceSelectPointerMove(clientX, clientY, buttons);
    },
    endFaceSelectPointerUp: () => {
      deps.getFaceModeCoordinator?.()?.endFaceSelectPointerUp();
    },
    isFaceSelectStrokeActive: () => {
      return deps.getFaceModeCoordinator?.()?.isFaceSelectStrokeActive() === true;
    },
    isGridAlignPickArmed: () => {
      return deps.getGridOrientationHandler?.()?.isAlignPickArmed() === true;
    },
    disarmGridAlignPick: () => {
      deps.getGridOrientationHandler?.()?.disarmAlignPick();
    },
    tryGridAlignPickAtPointer: (clientX, clientY) => {
      return (
        deps.getGridOrientationHandler?.()?.tryAlignPickAtClientPoint(clientX, clientY, getPointerOwnerDocument()) ===
        true
      );
    },
    updateGridAlignHoverAtPointer: (clientX, clientY) => {
      deps.getGridOrientationHandler?.()?.updateHoverAtClientPoint(clientX, clientY, getPointerOwnerDocument());
    },
    isEditModeActive: () => deps.getEditModeCoordinator?.()?.isActive() === true,
    beginEditSelectPointerDown: (clientX, clientY, isShiftPressed, isCtrlPressed, ownerDocument) => {
      return (
        deps
          .getEditModeCoordinator?.()
          ?.pickAtClientPoint(
            clientX,
            clientY,
            isShiftPressed,
            isCtrlPressed,
            ownerDocument ?? getPointerOwnerDocument(),
          ) === true
      );
    },
    setWidgetMode: (mode) => {
      deps.transformGizmo.setMode(mode);
    },
    getWidgetMode: () => deps.transformGizmo.getMode(),
    refreshGizmoPresentation: () => deps.refreshGizmoPresentation(),
    setStatusMessage: (message) => deps.setStatusMessage(message),
    registerUndo: (_name) => {},
    discardUndo: () => {},
    publishTransformDragVisualEnd: (objects, _reason) => {
      deps.onAfterTransformCommit([...objects]);
    },
    getLastPointerClientPosition: (ownerDocument) => resolveLastPointerClientPosition(deps, ownerDocument),
    isShiftPressed: () => resolveIsShiftPressed(deps, getLatchedModifierFlags),
    isCtrlPressed: () => resolveIsCtrlPressed(deps, getLatchedModifierFlags),
    isAltPressed: () => resolveIsAltPressed(deps, getLatchedModifierFlags),
    isModifierPressed: () => resolveIsModifierPressed(deps, getLatchedModifierFlags),
    handleGlobalKeyDown: (_keyCode, event) => getGlobalKeyDown()?.(event) === true,
    isNavigationBlockingTools: () => getNavigationBlocks()?.() === true,
  };
}

/**
 * Builds the object pick stack under a client point via the hit viewport.
 *
 * @param deps Layout services.
 * @param clientX Pointer client X.
 * @param clientY Pointer client Y.
 * @param viewport Optional pre-resolved viewport under the pointer.
 * @param ownerDocument Document that owns the client coordinates, or null.
 * @returns Near-to-far world meshes.
 */
function pickObjectStackAtClientPoint(
  deps: LayoutToolEditorSetupDeps,
  clientX: number,
  clientY: number,
  viewport: Viewport3D | Viewport2D | null = null,
  ownerDocument: Document | null = null,
): THREE.Mesh[] {
  const hitViewport = viewport ?? findInteractiveViewportAtClientPoint(deps, clientX, clientY, ownerDocument);
  if (!hitViewport || typeof hitViewport.getObjectPickStack !== 'function') {
    return [];
  }
  const synthetic = createSyntheticMouseEvent(clientX, clientY);
  return hitViewport.getObjectPickStack(synthetic);
}

/**
 * Applies click selection at a client point with multi-select modifiers.
 *
 * @param deps Layout services.
 * @param clientX Pointer client X.
 * @param clientY Pointer client Y.
 * @param additive True when Shift is held.
 * @param toggle True when Ctrl/Meta is held.
 * @param ownerDocument Document that owns the client coordinates, or null.
 */
function applyObjectClickSelectionAtClientPoint(
  deps: LayoutToolEditorSetupDeps,
  clientX: number,
  clientY: number,
  additive: boolean,
  toggle: boolean,
  ownerDocument: Document | null = null,
): void {
  const viewport = findInteractiveViewportAtClientPoint(deps, clientX, clientY, ownerDocument);
  const stack = pickObjectStackAtClientPoint(deps, clientX, clientY, viewport, ownerDocument);
  if (stack.length === 0) {
    if (!additive && !toggle) {
      deps.selectionManager.clearSelection();
    }
    SelectionClickThrough.resetClickThrough();
    return;
  }
  const orderedStack = orderObjectPickStackForViewport(stack, shouldUseReverseOutlinerObjectPick(viewport));
  const picked = resolveObjectPickFromStack(orderedStack, deps.selectionManager, additive, toggle, clientX, clientY);
  if (picked) {
    deps.selectionManager.selectFromClick(picked, additive, toggle);
  }
}

/**
 * Chooses the mesh for a click from a pick-priority stack.
 *
 * @param orderedStack Unique world meshes in pick-priority order (3D
 *   near-to-far or 2D reverse outliner).
 * @param selectionManager Selection state for click-through.
 * @param additive True when Shift is held.
 * @param toggle True when Ctrl/Meta is held.
 * @param clientX Pointer client X.
 * @param clientY Pointer client Y.
 * @returns Mesh to apply, or null.
 */
function resolveObjectPickFromStack(
  orderedStack: THREE.Mesh[],
  selectionManager: ManagerSelection,
  additive: boolean,
  toggle: boolean,
  clientX: number,
  clientY: number,
): THREE.Mesh | null {
  if (orderedStack.length === 0) {
    return null;
  }
  if (additive || toggle) {
    SelectionClickThrough.resetClickThrough();
    return orderedStack[0] ?? null;
  }
  return SelectionClickThrough.pickFromStack(orderedStack, selectionManager, clientX, clientY);
}

/**
 * Returns whether a viewport uses reverse outliner order for object picks (2D).
 *
 * @param viewport Interactive viewport under the pointer, or null.
 * @returns True for non-perspective (2D) viewports.
 */
function shouldUseReverseOutlinerObjectPick(viewport: Viewport3D | Viewport2D | null): boolean {
  if (!viewport) {
    return false;
  }
  if (typeof viewport.getViewportKind !== 'function') {
    return false;
  }
  return !isPerspectiveViewportKind(viewport.getViewportKind());
}

/**
 * Selects or deselects meshes whose projected centers fall inside a marquee.
 *
 * @param deps Layout services.
 * @param clientMinX Marquee min X.
 * @param clientMinY Marquee min Y.
 * @param clientMaxX Marquee max X.
 * @param clientMaxY Marquee max Y.
 * @param subtractive True when Ctrl marquee removes from selection.
 * @param ownerDocument Document that owns the client coordinates, or null.
 */
function applyObjectMarqueeSelection(
  deps: LayoutToolEditorSetupDeps,
  clientMinX: number,
  clientMinY: number,
  clientMaxX: number,
  clientMaxY: number,
  subtractive: boolean,
  ownerDocument: Document | null = null,
): void {
  const viewport = findInteractiveViewportAtClientPoint(
    deps,
    (clientMinX + clientMaxX) * 0.5,
    (clientMinY + clientMaxY) * 0.5,
    ownerDocument,
  );
  if (!viewport) {
    return;
  }
  const camera = viewport.getCamera();
  const pickElement = viewport.getContentElement();
  const rect = pickElement.getBoundingClientRect();
  const selectable =
    typeof viewport.getSelectableObjects === 'function'
      ? viewport.getSelectableObjects()
      : collectMeshesFromWorldFallback(deps);
  for (const mesh of selectable) {
    if (isMeshScreenCenterInMarquee(mesh, camera, rect, clientMinX, clientMinY, clientMaxX, clientMaxY)) {
      if (subtractive) {
        deps.selectionManager.removeFromSelection(mesh);
      } else {
        deps.selectionManager.addToSelection(mesh);
      }
    }
  }
}

/**
 * Returns whether a mesh projected center lies inside a client marquee rect.
 *
 * @param mesh Mesh to test.
 * @param camera Viewport camera.
 * @param pickRect Pick element client rect.
 * @param clientMinX Marquee min X.
 * @param clientMinY Marquee min Y.
 * @param clientMaxX Marquee max X.
 * @param clientMaxY Marquee max Y.
 * @returns True when the center is inside the marquee.
 */
function isMeshScreenCenterInMarquee(
  mesh: THREE.Mesh,
  camera: THREE.Camera,
  pickRect: DOMRect,
  clientMinX: number,
  clientMinY: number,
  clientMaxX: number,
  clientMaxY: number,
): boolean {
  mesh.updateMatrixWorld(true);
  const center = new THREE.Vector3();
  mesh.getWorldPosition(center);
  center.project(camera);
  if (center.z < -1 || center.z > 1) {
    return false;
  }
  const clientX = pickRect.left + (center.x + 1) * 0.5 * pickRect.width;
  const clientY = pickRect.top + (1 - center.y) * 0.5 * pickRect.height;
  return clientX >= clientMinX && clientX <= clientMaxX && clientY >= clientMinY && clientY <= clientMaxY;
}

/**
 * Fallback mesh list when a viewport does not expose selectable objects.
 *
 * @param deps Layout services.
 * @returns Empty array (marquee requires viewport selectable lists).
 */
function collectMeshesFromWorldFallback(_deps: LayoutToolEditorSetupDeps): THREE.Mesh[] {
  return [];
}

/**
 * Finds the interactive viewport under a client point. Client coordinates are
 * window-local; when ownerDocument is set only panes in that document are
 * tested so detached popups never hit main-window panes.
 *
 * @param deps Layout services.
 * @param clientX Pointer client X.
 * @param clientY Pointer client Y.
 * @param ownerDocument Optional document that owns the client coordinates.
 * @returns Viewport, or null.
 */
function findInteractiveViewportAtClientPoint(
  deps: LayoutToolEditorSetupDeps,
  clientX: number,
  clientY: number,
  ownerDocument: Document | null = null,
): Viewport3D | Viewport2D | null {
  return findPickSurfaceAtClientPoint(
    deps.getInteractiveViewports(),
    (viewport) => viewport.getContentElement(),
    clientX,
    clientY,
    ownerDocument,
  );
}

/**
 * Builds a minimal MouseEvent-like object for viewport pick helpers.
 *
 * @param clientX Pointer client X.
 * @param clientY Pointer client Y.
 * @returns Synthetic mouse event.
 */
function createSyntheticMouseEvent(clientX: number, clientY: number): MouseEvent {
  return {
    clientX,
    clientY,
    preventDefault: () => {},
    stopPropagation: () => {},
  } as unknown as MouseEvent;
}

/**
 * Yields selectable wrappers for selected objects.
 *
 * @param objects Selected objects.
 * @param cache Selectable cache by object identity.
 * @returns Iterable of selectables.
 */
function* iterateSelectables(
  objects: THREE.Object3D[],
  cache: Map<THREE.Object3D, ISelectable>,
): Iterable<ISelectable> {
  for (const object of objects) {
    let selectable = cache.get(object);
    if (!selectable) {
      selectable = createSelectableForObject(object);
      cache.set(object, selectable);
    }
    selectable.selected = true;
    selectable.position.copy(object.position);
    yield selectable;
  }
}

/**
 * Creates an ISelectable wrapper for a Three.js object.
 *
 * @param object Scene object.
 * @returns Selectable wrapper.
 */
function createSelectableForObject(object: THREE.Object3D): ISelectable {
  return {
    selected: true,
    position: object.position.clone(),
    gpVector1: new THREE.Vector3(),
  };
}

/**
 * Resolves average screen position of the selection for widget placement.
 *
 * @param deps Layout services.
 * @returns Screen coordinates.
 */
function resolveAverageScreenPosition(deps: LayoutToolEditorSetupDeps): { x: number; y: number } {
  const viewport = deps.getActiveViewport();
  const pickElement = viewport?.getContentElement();
  if (!pickElement) {
    return { x: 0, y: 0 };
  }
  const rect = pickElement.getBoundingClientRect();
  return {
    x: rect.left + rect.width * 0.5,
    y: rect.top + rect.height * 0.5,
  };
}

/**
 * Collects content elements for every interactive pane.
 *
 * @param deps Layout services.
 * @returns Pick elements in layout order.
 */
function collectInteractivePickElements(deps: LayoutToolEditorSetupDeps): HTMLElement[] {
  const elements: HTMLElement[] = [];
  for (const viewport of deps.getInteractiveViewports()) {
    const content = viewport.getContentElement();
    if (content) {
      elements.push(content);
    }
  }
  return elements;
}

/**
 * Registers interactive viewport content elements for early audio focus hits
 * from the input bridge (before tools run).
 *
 * @param deps Layout services.
 */
function syncAudioViewportContentRegistry(deps: LayoutToolEditorSetupDeps): void {
  audioViewportFocus.registerViewports(deps.getInteractiveViewports());
}

/**
 * Resolves camera and pick element for the interactive pane under a client
 * point. Client coordinates are document-local; when ownerDocument is set only
 * panes in that document are tested.
 *
 * @param deps Layout services.
 * @param clientX Pointer client X.
 * @param clientY Pointer client Y.
 * @param ownerDocument Optional document that owns the client coordinates.
 * @returns Pick context, or null when the point is not over a pane.
 */
function resolveInteractiveViewportAtClientPoint(
  deps: LayoutToolEditorSetupDeps,
  clientX: number,
  clientY: number,
  ownerDocument?: Document | null,
): { camera: THREE.Camera; pickElement: HTMLElement } | null {
  const viewport = findInteractiveViewportAtClientPoint(deps, clientX, clientY, ownerDocument ?? null);
  if (!viewport) {
    return null;
  }
  const pickElement = viewport.getContentElement();
  if (!pickElement) {
    return null;
  }
  return {
    camera: viewport.getCamera(),
    pickElement,
  };
}

/**
 * Returns the first interactive pane in a document (or any pane when document
 * is omitted).
 *
 * @param deps Layout services.
 * @param ownerDocument Document filter, or null for the first interactive pane.
 * @returns Pick context, or null when no pane exists.
 */
function resolveFirstInteractiveViewportInDocument(
  deps: LayoutToolEditorSetupDeps,
  ownerDocument?: Document | null,
): { camera: THREE.Camera; pickElement: HTMLElement } | null {
  for (const viewport of deps.getInteractiveViewports()) {
    const pickElement = viewport.getContentElement();
    if (!pickElement) {
      continue;
    }
    if (ownerDocument && pickElement.ownerDocument !== ownerDocument) {
      continue;
    }
    return {
      camera: viewport.getCamera(),
      pickElement,
    };
  }
  return null;
}

/**
 * Resolves the last pointer client position for a document.
 *
 * @param deps Layout services.
 * @param ownerDocument Document that owns the sample, or null for main.
 * @returns Client coordinates, or null.
 */
function resolveLastPointerClientPosition(
  deps: LayoutToolEditorSetupDeps,
  ownerDocument?: Document | null,
): { clientX: number; clientY: number } | null {
  if (!ownerDocument || ownerDocument === document) {
    return deps.inputManager.getLastPointerClientPosition();
  }
  return deps.getLastPointerClientPositionForDocument?.(ownerDocument) ?? null;
}

/**
 * Collects main and detached input managers for multi-window modifier queries.
 *
 * @param deps Layout services.
 * @returns Input managers in query order.
 */
function collectInputManagers(deps: LayoutToolEditorSetupDeps): ManagerInput[] {
  const managers: ManagerInput[] = [deps.inputManager];
  const detached = deps.getDetachedInputManagers?.() ?? [];
  for (const manager of detached) {
    managers.push(manager);
  }
  return managers;
}

/**
 * Resolves Shift for tools and widgets (bridge latch, then all input managers).
 *
 * @param deps Layout services.
 * @param getLatchedModifierFlags Bridge-latched DOM modifiers.
 * @returns True when Shift is active.
 */
function resolveIsShiftPressed(
  deps: LayoutToolEditorSetupDeps,
  getLatchedModifierFlags: () => DomModifierKeyFlags | null,
): boolean {
  const latch = getLatchedModifierFlags();
  if (latch && isShiftPressedOnDomFlags(latch)) {
    return true;
  }
  return isShiftPressedOnInputManagers(collectInputManagers(deps));
}

/**
 * Resolves Ctrl/Meta for tools and widgets.
 *
 * @param deps Layout services.
 * @param getLatchedModifierFlags Bridge-latched DOM modifiers.
 * @returns True when Ctrl or Meta is active.
 */
function resolveIsCtrlPressed(
  deps: LayoutToolEditorSetupDeps,
  getLatchedModifierFlags: () => DomModifierKeyFlags | null,
): boolean {
  const latch = getLatchedModifierFlags();
  if (latch && isCtrlOrMetaPressedOnDomFlags(latch)) {
    return true;
  }
  return isCtrlOrMetaPressedOnInputManagers(collectInputManagers(deps));
}

/**
 * Resolves Alt for tools and widgets.
 *
 * @param deps Layout services.
 * @param getLatchedModifierFlags Bridge-latched DOM modifiers.
 * @returns True when Alt is active.
 */
function resolveIsAltPressed(
  deps: LayoutToolEditorSetupDeps,
  getLatchedModifierFlags: () => DomModifierKeyFlags | null,
): boolean {
  const latch = getLatchedModifierFlags();
  if (latch && isAltPressedOnDomFlags(latch)) {
    return true;
  }
  return isAltPressedOnInputManagers(collectInputManagers(deps));
}

/**
 * Resolves any modifier for tools and widgets.
 *
 * @param deps Layout services.
 * @param getLatchedModifierFlags Bridge-latched DOM modifiers.
 * @returns True when any modifier is active.
 */
function resolveIsModifierPressed(
  deps: LayoutToolEditorSetupDeps,
  getLatchedModifierFlags: () => DomModifierKeyFlags | null,
): boolean {
  const latch = getLatchedModifierFlags();
  if (latch && isAnyModifierPressedOnDomFlags(latch)) {
    return true;
  }
  return isAnyModifierPressedOnInputManagers(collectInputManagers(deps));
}

/**
 * Builds the permanent component gizmo bridge for Edit Mode.
 *
 * @param deps Layout services.
 * @param getPointerOwnerDocument Document that owns the last pointer sample.
 * @returns Component transform interaction bridge.
 */
function createComponentTransformBridge(
  deps: LayoutToolEditorSetupDeps,
  getPointerOwnerDocument: () => Document | null,
): BridgeComponentTransformInteraction {
  return new BridgeComponentTransformInteraction({
    transformGizmo: deps.transformGizmo,
    componentTransformHandler: deps.componentTransformHandler,
    gridSnap: deps.gridSnap,
    inputManager: deps.inputManager,
    getUserSnapEnabled: deps.getUserSnapEnabled,
    getEditModeCoordinator: () => deps.getEditModeCoordinator?.() ?? null,
    probeViewportAtClientPoint: (clientX, clientY) =>
      resolveInteractiveViewportObjectAtClientPoint(deps, clientX, clientY, getPointerOwnerDocument()),
    onPermanentGizmoHandleDragBegan: () => deps.onPermanentGizmoHandleDragBegan?.(),
    onPermanentGizmoHandleDragEnded: () => deps.onPermanentGizmoHandleDragEnded?.(),
    onLiveComponentTransform: () => deps.refreshGizmoPresentation(),
    onAfterComponentTransformCommit: () => deps.refreshGizmoPresentation(),
  });
}

/**
 * Finds the interactive viewport whose content element contains a client point.
 *
 * @param deps Layout services.
 * @param clientX Pointer client X.
 * @param clientY Pointer client Y.
 * @param ownerDocument Optional document that owns the client coordinates.
 * @returns Viewport under the pointer, or null.
 */
function resolveInteractiveViewportObjectAtClientPoint(
  deps: LayoutToolEditorSetupDeps,
  clientX: number,
  clientY: number,
  ownerDocument: Document | null = null,
): Viewport3D | Viewport2D | null {
  return findInteractiveViewportAtClientPoint(deps, clientX, clientY, ownerDocument);
}

/**
 * Starts a single-use drag with gizmos hidden (Shape Editor / Blender: no
 * transform widgets during G/R/S).
 *
 * @param deps Layout services.
 * @param inputBridge Input bridge for exclusive viewport pin.
 * @param mode Transform mode.
 * @param objects Drag targets.
 * @param pivot World pivot.
 * @param camera Active camera.
 * @param pickElement Pick element.
 * @param clientX Pointer client X.
 * @param clientY Pointer client Y.
 * @returns True when the drag started.
 */
function beginSingleUseDragHiddenGizmo(
  deps: LayoutToolEditorSetupDeps,
  inputBridge: EditorInputBridge,
  mode: TransformMode,
  objects: THREE.Object3D[],
  pivot: THREE.Vector3,
  camera: THREE.Camera,
  pickElement: HTMLElement,
  clientX: number,
  clientY: number,
): boolean {
  inputBridge.setExclusiveViewportRoots(collectInteractivePickElements(deps));
  syncSingleUseSnapFromShift(deps);
  const started = deps.transformHandler.beginSingleUseDrag(mode, objects, pivot, camera, pickElement, clientX, clientY);
  if (started) {
    deps.transformGizmo.setVisible(false);
  }
  return started;
}

/**
 * Starts a component single-use drag when Edit Mode has a component selection.
 *
 * @param deps Layout deps.
 * @param mode Transform mode.
 * @param camera Camera.
 * @param pickElement Pick element.
 * @param clientX Pointer X.
 * @param clientY Pointer Y.
 * @returns True when a component drag started.
 */
function tryBeginComponentSingleUseDrag(
  deps: LayoutToolEditorSetupDeps,
  mode: TransformMode,
  camera: THREE.Camera,
  pickElement: HTMLElement,
  clientX: number,
  clientY: number,
): boolean {
  const coordinator = deps.getEditModeCoordinator?.() ?? null;
  if (!coordinator?.isActive()) {
    return false;
  }
  const session = coordinator.getSession();
  const vertices = expandComponentSelectionToTransformVertices(
    session.getComponentSelection().getSelected(),
    session.getDomain(),
  );
  const pivot = computeComponentTransformPivot(vertices);
  if (!pivot) {
    return false;
  }
  deps.componentTransformHandler.setAfterCommitCallback(() => {
    coordinator.refreshDomainGeometryPresentation();
    deps.refreshGizmoPresentation();
  });
  deps.componentTransformHandler.setAfterLiveCallback(() => {
    coordinator.refreshDomainGeometryPresentation();
    deps.refreshGizmoPresentation();
  });
  deps.componentTransformHandler.setStatusCallback((text) => {
    if (text.length === 0) {
      return;
    }
    deps.setStatusMessage(text);
  });
  syncSingleUseSnapFromShift(deps);
  return deps.componentTransformHandler.beginSingleUseDrag(
    mode,
    vertices,
    pivot,
    camera,
    pickElement,
    clientX,
    clientY,
  );
}

/**
 * Returns the unlocked object selection length, or the component selection
 * count when edit mode is active.
 *
 * @param deps Layout services providing selection and optional edit-mode
 *   coordinator.
 * @returns Selection count.
 */
function resolveEditorSelectedCount(deps: LayoutToolEditorSetupDeps): number {
  const coordinator = deps.getEditModeCoordinator?.() ?? null;
  if (coordinator?.isActive()) {
    return coordinator.getComponentSelectionCount();
  }
  return filterUnlockedObjects(deps.selectionManager.getAllSelectedObjectsAsArray()).length;
}

/**
 * Returns the transform pivot for tools and gizmos.
 *
 * @param deps Layout deps.
 * @returns World pivot.
 */
function resolveEditorTransformPivot(deps: LayoutToolEditorSetupDeps): THREE.Vector3 {
  const coordinator = deps.getEditModeCoordinator?.() ?? null;
  if (coordinator?.isActive()) {
    const session = coordinator.getSession();
    const vertices = expandComponentSelectionToTransformVertices(
      session.getComponentSelection().getSelected(),
      session.getDomain(),
    );
    const pivot = computeComponentTransformPivot(vertices);
    if (pivot) {
      return pivot;
    }
  }
  return deps.getTransformPivot();
}

/**
 * Applies a live single-use pointer move sample.
 *
 * @param deps Layout services.
 * @param clientX Pointer client X.
 * @param clientY Pointer client Y.
 * @param camera Camera for projection.
 * @param pickElement Pick element for NDC.
 */
function applySingleUsePointerMove(
  deps: LayoutToolEditorSetupDeps,
  clientX: number,
  clientY: number,
  camera: THREE.Camera,
  pickElement: HTMLElement,
): void {
  if (!deps.transformHandler.isDragging()) {
    return;
  }
  syncSingleUseSnapFromShift(deps);
  const selection = resolveSingleUseSelection(deps);
  const pivot = deps.getTransformPivot();
  const synthetic = {
    clientX,
    clientY,
    preventDefault: () => {},
    stopPropagation: () => {},
  } as unknown as MouseEvent;
  deps.transformHandler.onPointerMove(camera, pickElement, synthetic, pivot, selection.transformTargets);
  publishLiveTransformVisuals(deps, selection);
}

/**
 * Applies Shift precision snap disable for the current single-use sample from
 * live InputManager Shift state (not sticky state from a prior parent drag).
 *
 * @param deps Layout services with grid snap and input.
 */
function syncSingleUseSnapFromShift(deps: LayoutToolEditorSetupDeps): void {
  applyGridSnapPrecisionFromShift(deps.gridSnap, deps.inputManager.isShiftDown(), deps.getUserSnapEnabled());
}

/**
 * Restores the user snap preference after single-use commit or cancel.
 *
 * @param deps Layout services with grid snap.
 */
function restoreSingleUseSnapUserPreference(deps: LayoutToolEditorSetupDeps): void {
  restoreGridSnapUserPreference(deps.gridSnap, deps.getUserSnapEnabled());
}

/**
 * Routes modal transform keys (axis lock, numeric typing) and refreshes solid
 * geometry / overlays with the same live path as pointer moves. Component
 * single-use G/R/S in Edit Mode uses the same X/Y/Z and math entry as object
 * tools.
 *
 * @param deps Layout services.
 * @param event Browser keyboard event.
 * @returns True when the modal controller consumed the key.
 */
function handleModalKeyDownWithLiveVisuals(deps: LayoutToolEditorSetupDeps, event: KeyboardEvent): boolean {
  if (deps.componentTransformHandler.isDragging()) {
    return handleComponentModalKeyDownWithLiveVisuals(deps, event);
  }
  const handled = deps.transformHandler.handleModalKeyDown(event);
  if (!shouldPublishLiveVisualsAfterModalKey(handled, deps.transformHandler.isDragging())) {
    return handled;
  }
  publishLiveTransformVisuals(deps, resolveSingleUseSelection(deps));
  return true;
}

/**
 * Routes modal keys during Edit Mode component transform and refreshes the cage
 * / wireframe suppress after the pose sample.
 *
 * @param deps Layout services.
 * @param event Browser keyboard event.
 * @returns True when the component modal controller consumed the key.
 */
function handleComponentModalKeyDownWithLiveVisuals(deps: LayoutToolEditorSetupDeps, event: KeyboardEvent): boolean {
  const handled = deps.componentTransformHandler.handleModalKeyDown(event);
  if (!handled) {
    return false;
  }
  deps.getEditModeCoordinator?.()?.refreshDomainGeometryPresentation();
  deps.refreshGizmoPresentation();
  return true;
}

/**
 * Publishes live solid CSG, outline sync, and ruler feedback after a pose
 * sample (pointer or modal keyboard).
 *
 * @param deps Layout services.
 * @param selection Current unlocked selection snapshot.
 */
function publishLiveTransformVisuals(deps: LayoutToolEditorSetupDeps, selection: SingleUseSelectionSnapshot): void {
  publishLayoutTransformLiveVisuals(deps, selection);
}

/** Selection and transform targets for a single-use pointer sample. */
interface SingleUseSelectionSnapshot {
  selectedMeshes: THREE.Mesh[];
  transformTargets: THREE.Object3D[];
}

/**
 * Resolves unlocked selection meshes and gizmo-style transform targets.
 *
 * @param deps Layout services.
 * @returns Selection snapshot for live move or commit.
 */
function resolveSingleUseSelection(deps: LayoutToolEditorSetupDeps): SingleUseSelectionSnapshot {
  const selectedMeshes = filterUnlockedObjects(deps.selectionManager.getAllSelectedObjectsAsArray());
  const transformTargets = resolveTransformTargets(selectedMeshes, deps.selectionManager.getInspectorObjects());
  return { selectedMeshes, transformTargets };
}

/**
 * Visual refresh after modal Enter/Escape commit or cancel for permanent gizmo
 * drags.
 *
 * @param deps Layout services.
 */
function wireAfterDragVisualRefresh(deps: LayoutToolEditorSetupDeps): void {
  deps.transformHandler.setAfterDragVisualsCallback((objects) => {
    deps.onAfterTransformCommit(objects);
  });
}
