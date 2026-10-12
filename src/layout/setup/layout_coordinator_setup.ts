import * as THREE from 'three';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { StatusBar } from '@/ui/status/status_bar.js';
import { CoordinatorCameraFit } from '@/navigation/camera/coordinator_camera_fit.js';
import { CoordinatorShadingMode } from '@/navigation/camera/coordinator_shading_mode.js';
import type { ViewportEditor } from '@/viewports/core/viewport_editor.js';
import { ControllerSelectionVisual } from '@/selection/object/controller_selection_visual.js';
import { HandlerKeyboardShortcut } from '@/input/handler_keyboard_shortcut.js';
import { CoordinatorFaceMode } from '@/tools/face/coordinator_face_mode.js';
import { CommandStack } from '@/commands/command_stack.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { ControllerViewportToolChrome } from '@/tools/chrome/controller/controller_viewport_tool_chrome.js';
import { PolicyEditorOverlay } from '@/tools/overlay/policy_editor_overlay.js';
import { RegistryModalToolSession } from '@/tools/session/registry_modal_tool_session.js';
import {
  setupClipToolsAndPalette,
  cancelClipAndSelectObject,
  syncToolChromeToViewports,
} from '@/tools/clip_plane/layout/layout_clip_tools_setup.js';
import { ToolClipPlane } from '@/tools/clip_plane/tool_clip_plane.js';
import { HandlerClipPlane } from '@/tools/clip_plane/handler_clip_plane.js';
import { TransformMode } from '@/types/transform_mode.js';
import { EditorComponentMode } from '@/types/editor_component_mode.js';

/**
 * Builds camera fit and shading coordinators and wires their controls.
 *
 * @param parts Viewport and selection dependencies.
 * @returns Camera and shading coordinators.
 */
export function setupCameraAndShadingCoordinators(parts: {
  selectionManager: ManagerSelection;
  statusBar: StatusBar | null;
  keyboardShortcutHandler: HandlerKeyboardShortcut;
  getViewports: () => readonly ViewportEditor[];
  getViewportElements: () => readonly HTMLElement[];
  selectionVisualController: ControllerSelectionVisual;
  getDetachedViewports?: () => readonly ViewportEditor[];
}): {
  cameraFitCoordinator: CoordinatorCameraFit;
  shadingModeCoordinator: CoordinatorShadingMode;
} {
  const shadingModeCoordinator = new CoordinatorShadingMode(
    parts.getViewports,
    parts.getViewportElements,
    parts.selectionVisualController,
    parts.statusBar,
  );
  const cameraFitCoordinator = new CoordinatorCameraFit(
    parts.selectionManager,
    parts.statusBar,
    () => shadingModeCoordinator.getOrderedViewports(),
    () => shadingModeCoordinator.getActiveViewportIndex(),
    () => parts.getDetachedViewports?.() ?? [],
  );
  cameraFitCoordinator.bindKeyboardShortcuts(parts.keyboardShortcutHandler);
  shadingModeCoordinator.wireControls(parts.keyboardShortcutHandler, (viewport) =>
    cameraFitCoordinator.fitSpecificViewport(viewport),
  );
  return { cameraFitCoordinator, shadingModeCoordinator };
}

/**
 * Builds the face selection and extrusion coordinator.
 *
 * @param parts Scene and UI dependencies.
 * @returns Face mode coordinator.
 */
export function setupFaceModeCoordinator(parts: {
  getViewports: () => ViewportEditor[];
  getPrimaryScene: () => THREE.Scene;
  commandStack: CommandStack;
  gridSnap: GridSnap;
  worldObject: THREE.Group;
  selectionManager: ManagerSelection;
  statusBar: StatusBar | null;
  keyboardShortcutHandler: HandlerKeyboardShortcut;
  showStatusMessage: (message: string) => void;
  syncPrimitivesToViewports: () => void;
  updateShadingMeshes: () => void;
  refreshOutliner: () => void;
  onSelectionModeUiChanged: () => void;
}): CoordinatorFaceMode {
  return new CoordinatorFaceMode({
    getViewports: parts.getViewports,
    getPrimaryScene: parts.getPrimaryScene,
    commandStack: parts.commandStack,
    gridSnap: parts.gridSnap,
    worldObject: parts.worldObject,
    selectionManager: parts.selectionManager,
    statusBar: parts.statusBar,
    keyboardShortcutHandler: parts.keyboardShortcutHandler,
    showStatusMessage: parts.showStatusMessage,
    syncPrimitivesToViewports: parts.syncPrimitivesToViewports,
    updateShadingMeshes: parts.updateShadingMeshes,
    refreshOutliner: parts.refreshOutliner,
    onSelectionModeUiChanged: () => parts.onSelectionModeUiChanged(),
  });
}

/**
 * Builds viewport tool chrome and clip plane tool wiring.
 *
 * @param parts Clip tool dependencies.
 * @returns Clip handler and tool chrome controller.
 */
export function setupToolsPaletteAndClipWiring(parts: {
  worldObject: THREE.Group;
  commandStack: CommandStack;
  selectionManager: ManagerSelection;
  gridSnap: GridSnap;
  clipPlaneTool: ToolClipPlane;
  faceModeCoordinator: CoordinatorFaceMode;
  toolbarContainer: HTMLElement;
  getViewports: () => ViewportEditor[];
  keyboardShortcutHandler: HandlerKeyboardShortcut;
  showStatusMessage: (message: string) => void;
  syncPrimitivesToViewports: () => void;
  refreshOutliner: () => void;
  updateShadingMeshes: () => void;
  onToolStateChanged: () => void;
  onClipCancel: () => void;
  onTransformMode: (mode: TransformMode) => void;
  onOpenUvEditor: () => void;
  editorOverlayPolicy: PolicyEditorOverlay;
  modalToolSessionRegistry: RegistryModalToolSession;
  isEditorToolBusy?: () => boolean;
  switchToClipTool?: () => boolean;
  switchToObjectSelect?: () => void;
  switchToFaceSelect?: () => void;
  switchToEditSelect?: () => void;
  switchToGridTool?: () => void;
  onGridReset?: () => void;
  onGridAlignToFace?: () => void;
  onGridAlignAxis?: (
    axis: import('@/navigation/orientation/editor_orientation_axis.js').EditorOrientationAxisId,
  ) => void;
  onGridOriginVertex?: () => void;
  onCameraReset?: () => void;
  onCameraAlignToFace?: () => void;
  onPrimaryToolChanged?: () => void;
  registerClipTool?: (
    placement: import('@/tools/clip_plane/tool_clip_plane.js').ToolClipPlane,
    handler: HandlerClipPlane,
  ) => void;
  onEnterEditMode?: () => boolean;
  onExitEditMode?: () => void;
  onComponentMode?: (mode: EditorComponentMode) => void;
  onEditModePresentationChanged?: () => void;
  onApplyObjectTransform?: (kind: import('@/types/object_apply_transform_kind.js').ObjectApplyTransformKind) => void;
  onEditKnife?: () => void;
  onEditLoopCut?: () => void;
  onEditMerge?: (mode: import('@/edit/topology/topology_vertex_merge_mode.js').TopologyVertexMergeMode) => void;
  onEditDissolve?: () => void;
  onEditDelete?: () => void;
}): {
  clipPlaneHandler: HandlerClipPlane;
  toolsPaletteController: ControllerViewportToolChrome;
} {
  return setupClipToolsAndPalette({
    worldObject: parts.worldObject,
    commandStack: parts.commandStack,
    selectionManager: parts.selectionManager,
    gridSnap: parts.gridSnap,
    clipPlaneTool: parts.clipPlaneTool,
    faceExtrusionController: parts.faceModeCoordinator.getFaceExtrusionController(),
    toolbarContainer: parts.toolbarContainer,
    getViewports: parts.getViewports,
    keyboardShortcutHandler: parts.keyboardShortcutHandler,
    showStatusMessage: parts.showStatusMessage,
    syncPrimitivesToViewports: parts.syncPrimitivesToViewports,
    refreshOutliner: parts.refreshOutliner,
    updateShadingMeshes: parts.updateShadingMeshes,
    onToolStateChanged: parts.onToolStateChanged,
    onClipCancel: parts.onClipCancel,
    editorOverlayPolicy: parts.editorOverlayPolicy,
    modalToolSessionRegistry: parts.modalToolSessionRegistry,
    onTransformMode: parts.onTransformMode,
    onOpenUvEditor: parts.onOpenUvEditor,
    onExtrudeFaces: () => parts.faceModeCoordinator.onExtrudeFaces(),
    ...(parts.isEditorToolBusy !== undefined ? { isEditorToolBusy: parts.isEditorToolBusy } : {}),
    ...(parts.switchToClipTool !== undefined ? { switchToClipTool: parts.switchToClipTool } : {}),
    ...(parts.switchToObjectSelect !== undefined ? { switchToObjectSelect: parts.switchToObjectSelect } : {}),
    ...(parts.switchToFaceSelect !== undefined ? { switchToFaceSelect: parts.switchToFaceSelect } : {}),
    ...(parts.switchToEditSelect !== undefined ? { switchToEditSelect: parts.switchToEditSelect } : {}),
    ...(parts.switchToGridTool !== undefined ? { switchToGridTool: parts.switchToGridTool } : {}),
    ...(parts.onGridReset !== undefined ? { onGridReset: parts.onGridReset } : {}),
    ...(parts.onGridAlignToFace !== undefined ? { onGridAlignToFace: parts.onGridAlignToFace } : {}),
    ...(parts.onGridAlignAxis !== undefined ? { onGridAlignAxis: parts.onGridAlignAxis } : {}),
    ...(parts.onGridOriginVertex !== undefined ? { onGridOriginVertex: parts.onGridOriginVertex } : {}),
    ...(parts.onCameraReset !== undefined ? { onCameraReset: parts.onCameraReset } : {}),
    ...(parts.onCameraAlignToFace !== undefined ? { onCameraAlignToFace: parts.onCameraAlignToFace } : {}),
    ...(parts.onPrimaryToolChanged !== undefined ? { onPrimaryToolChanged: parts.onPrimaryToolChanged } : {}),
    ...(parts.registerClipTool !== undefined ? { registerClipTool: parts.registerClipTool } : {}),
    ...(parts.onEnterEditMode !== undefined ? { onEnterEditMode: parts.onEnterEditMode } : {}),
    ...(parts.onExitEditMode !== undefined ? { onExitEditMode: parts.onExitEditMode } : {}),
    ...(parts.onComponentMode !== undefined ? { onComponentMode: parts.onComponentMode } : {}),
    ...(parts.onEditModePresentationChanged !== undefined
      ? { onEditModePresentationChanged: parts.onEditModePresentationChanged }
      : {}),
    ...(parts.onApplyObjectTransform !== undefined ? { onApplyObjectTransform: parts.onApplyObjectTransform } : {}),
    ...(parts.onEditKnife !== undefined ? { onEditKnife: parts.onEditKnife } : {}),
    ...(parts.onEditLoopCut !== undefined ? { onEditLoopCut: parts.onEditLoopCut } : {}),
    ...(parts.onEditMerge !== undefined ? { onEditMerge: parts.onEditMerge } : {}),
    ...(parts.onEditDissolve !== undefined ? { onEditDissolve: parts.onEditDissolve } : {}),
    ...(parts.onEditDelete !== undefined ? { onEditDelete: parts.onEditDelete } : {}),
  });
}

/**
 * Cancels clip mode and selects the object tool in the chrome.
 *
 * @param clipPlaneHandler Active clip handler.
 * @param toolsPaletteController Tool chrome controller.
 */
export function cancelClipToolSelection(
  clipPlaneHandler: HandlerClipPlane | null,
  toolsPaletteController: ControllerViewportToolChrome | null,
): void {
  cancelClipAndSelectObject(clipPlaneHandler, toolsPaletteController);
}

/**
 * Re-attaches tool chrome after viewport layout changes.
 *
 * @param toolsPaletteController Tool chrome controller.
 * @param getViewports Live viewports.
 */
export function refreshViewportToolChrome(
  toolsPaletteController: ControllerViewportToolChrome | null,
  getViewports: () => readonly ViewportEditor[],
): void {
  if (!toolsPaletteController) {
    return;
  }
  syncToolChromeToViewports(toolsPaletteController, getViewports);
}
