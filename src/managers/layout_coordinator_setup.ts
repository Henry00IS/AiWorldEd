import * as THREE from 'three';
import { SelectionManager } from './selection_manager.js';
import { StatusBar } from '../ui/status_bar.js';
import { CameraFitCoordinator } from './camera_fit_coordinator.js';
import { ShadingModeCoordinator } from './shading_mode_coordinator.js';
import { Viewport2D } from '../viewports/viewport_2d.js';
import { Viewport3D } from '../viewports/viewport_3d.js';
import { SelectionVisualController } from './selection_visual_controller.js';
import { KeyboardShortcutHandler } from './keyboard_shortcut_handler.js';
import { FaceModeCoordinator } from './face_mode_coordinator.js';
import { CommandStack } from '../commands/command_stack.js';
import { GridSnap } from '../transform/grid_snap.js';
import { ToolsPaletteController } from './tools_palette_controller.js';
import {
  setupClipToolsAndPalette,
  cancelClipAndSelectObject
} from './layout_clip_tools_setup.js';
import { ClipPlaneTool } from './clip_plane_tool.js';
import { ClipPlaneHandler } from './clip_plane_handler.js';
import { ToolsPalette } from '../ui/tools_palette.js';
import { TransformMode } from '../types/transform_mode.js';

/**
 * Builds camera fit and shading coordinators and wires their controls.
 * @param parts Viewport and selection dependencies.
 * @returns Camera and shading coordinators.
 */
export function setupCameraAndShadingCoordinators(parts: {
  selectionManager: SelectionManager;
  statusBar: StatusBar | null;
  keyboardShortcutHandler: KeyboardShortcutHandler;
  viewport2DTop: Viewport2D;
  viewport2DFront: Viewport2D;
  viewport2DSide: Viewport2D;
  viewport3D: Viewport3D;
  viewports: HTMLElement[];
  selectionVisualController: SelectionVisualController;
}): {
  cameraFitCoordinator: CameraFitCoordinator;
  shadingModeCoordinator: ShadingModeCoordinator;
} {
  const shadingModeCoordinator = new ShadingModeCoordinator(
    parts.viewport2DTop,
    parts.viewport2DFront,
    parts.viewport2DSide,
    parts.viewport3D,
    parts.viewports,
    parts.selectionVisualController,
    parts.statusBar
  );
  const cameraFitCoordinator = new CameraFitCoordinator(
    parts.selectionManager,
    parts.statusBar,
    () => shadingModeCoordinator.getOrderedViewports(),
    () => shadingModeCoordinator.getActiveViewportIndex()
  );
  cameraFitCoordinator.bindKeyboardShortcuts(parts.keyboardShortcutHandler);
  shadingModeCoordinator.wireControls(
    parts.keyboardShortcutHandler,
    (viewport) => cameraFitCoordinator.fitSpecificViewport(viewport)
  );
  return { cameraFitCoordinator, shadingModeCoordinator };
}

/**
 * Builds the face selection and extrusion coordinator.
 * @param parts Scene and UI dependencies.
 * @param onSelectionModeUiChanged Called when face/object mode changes.
 * @returns Face mode coordinator.
 */
export function setupFaceModeCoordinator(parts: {
  viewport3D: Viewport3D;
  viewport2DTop: Viewport2D;
  viewport2DFront: Viewport2D;
  viewport2DSide: Viewport2D;
  commandStack: CommandStack;
  gridSnap: GridSnap;
  worldObject: THREE.Group;
  selectionManager: SelectionManager;
  statusBar: StatusBar | null;
  keyboardShortcutHandler: KeyboardShortcutHandler;
  showStatusMessage: (message: string) => void;
  syncPrimitivesToViewports: () => void;
  updateShadingMeshes: () => void;
  refreshOutliner: () => void;
  onSelectionModeUiChanged: () => void;
}): FaceModeCoordinator {
  return new FaceModeCoordinator({
    viewport3D: parts.viewport3D,
    viewport2DTop: parts.viewport2DTop,
    viewport2DFront: parts.viewport2DFront,
    viewport2DSide: parts.viewport2DSide,
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
    onSelectionModeUiChanged: () => parts.onSelectionModeUiChanged()
  });
}

/**
 * Builds tools palette and clip plane tool wiring.
 * @param parts Clip tool dependencies.
 * @returns Clip handler and tools palette pair.
 */
export function setupToolsPaletteAndClipWiring(parts: {
  worldObject: THREE.Group;
  commandStack: CommandStack;
  selectionManager: SelectionManager;
  gridSnap: GridSnap;
  clipPlaneTool: ClipPlaneTool;
  faceModeCoordinator: FaceModeCoordinator;
  toolbarContainer: HTMLElement;
  anchorViewport: HTMLElement;
  viewport3D: Viewport3D;
  viewport2DTop: Viewport2D;
  viewport2DFront: Viewport2D;
  viewport2DSide: Viewport2D;
  keyboardShortcutHandler: KeyboardShortcutHandler;
  showStatusMessage: (message: string) => void;
  syncPrimitivesToViewports: () => void;
  refreshOutliner: () => void;
  updateShadingMeshes: () => void;
  onToolStateChanged: () => void;
  onClipCancel: () => void;
  onTransformMode: (mode: TransformMode) => void;
  onOpenUvEditor: () => void;
}): {
  clipPlaneHandler: ClipPlaneHandler;
  toolsPalette: ToolsPalette;
  toolsPaletteController: ToolsPaletteController;
} {
  return setupClipToolsAndPalette({
    worldObject: parts.worldObject,
    commandStack: parts.commandStack,
    selectionManager: parts.selectionManager,
    gridSnap: parts.gridSnap,
    clipPlaneTool: parts.clipPlaneTool,
    faceExtrusionController:
      parts.faceModeCoordinator.getFaceExtrusionController(),
    toolbarContainer: parts.toolbarContainer,
    anchorViewport: parts.anchorViewport,
    viewport3D: parts.viewport3D,
    viewport2DTop: parts.viewport2DTop,
    viewport2DFront: parts.viewport2DFront,
    viewport2DSide: parts.viewport2DSide,
    keyboardShortcutHandler: parts.keyboardShortcutHandler,
    showStatusMessage: parts.showStatusMessage,
    syncPrimitivesToViewports: parts.syncPrimitivesToViewports,
    refreshOutliner: parts.refreshOutliner,
    updateShadingMeshes: parts.updateShadingMeshes,
    onToolStateChanged: parts.onToolStateChanged,
    onClipCancel: parts.onClipCancel,
    onTransformMode: parts.onTransformMode,
    onOpenUvEditor: parts.onOpenUvEditor,
    onExtrudeFaces: () => parts.faceModeCoordinator.onExtrudeFaces()
  });
}

/**
 * Cancels clip mode and selects the object tool in the palette.
 * @param clipPlaneHandler Active clip handler.
 * @param toolsPaletteController Tools palette controller.
 */
export function cancelClipToolSelection(
  clipPlaneHandler: ClipPlaneHandler | null,
  toolsPaletteController: ToolsPaletteController | null
): void {
  cancelClipAndSelectObject(clipPlaneHandler, toolsPaletteController);
}
