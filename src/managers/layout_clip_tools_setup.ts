import { ToolsPalette } from '../ui/tools_palette.js';
import { ToolsPaletteController } from './tools_palette_controller.js';
import { ClipPlaneTool } from './clip_plane_tool.js';
import { ClipPlaneHandler } from './clip_plane_handler.js';
import { FaceExtrusionController } from './face_extrusion_controller.js';
import { SelectionManager } from './selection_manager.js';
import { CommandStack } from '../commands/command_stack.js';
import { GridSnap } from '../transform/grid_snap.js';
import { KeyboardShortcutHandler } from './keyboard_shortcut_handler.js';
import { EditorToolId } from '../types/editor_tool_id.js';
import { TransformMode } from '../types/transform_mode.js';
import { Viewport3D } from '../viewports/viewport_3d.js';
import { Viewport2D } from '../viewports/viewport_2d.js';
import * as THREE from 'three';

/**
 * Dependencies for tools palette and clip plane wiring.
 */
export interface ClipToolsSetupDeps {
  worldObject: THREE.Group;
  commandStack: CommandStack;
  selectionManager: SelectionManager;
  gridSnap: GridSnap;
  clipPlaneTool: ClipPlaneTool;
  faceExtrusionController: FaceExtrusionController;
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
  onExtrudeFaces: () => void;
}

/**
 * Result of tools palette and clip plane construction.
 */
export interface ClipToolsSetupResult {
  toolsPalette: ToolsPalette;
  toolsPaletteController: ToolsPaletteController;
  clipPlaneHandler: ClipPlaneHandler;
}

/**
 * Creates the floating Tools palette, clip plane handler, and related wiring.
 * @param deps Shared services and viewports for clip/tools setup.
 * @returns Created palette, controller, and clip handler.
 */
export function setupClipToolsAndPalette(
  deps: ClipToolsSetupDeps
): ClipToolsSetupResult {
  const clipPlaneHandler = createClipPlaneHandler(deps);
  const controllerHolder: { current: ToolsPaletteController | null } = {
    current: null
  };
  const toolsPalette = createToolsPalette(deps, controllerHolder, clipPlaneHandler);
  const toolsPaletteController = createToolsPaletteController(
    deps,
    toolsPalette,
    clipPlaneHandler
  );
  controllerHolder.current = toolsPaletteController;
  wireClipPlaneViewportCallbacks(deps, clipPlaneHandler);
  wireClipPlaneKeyboardShortcuts(deps, clipPlaneHandler);
  toolsPalette.show();
  return { toolsPalette, toolsPaletteController, clipPlaneHandler };
}

/**
 * Builds the clip plane handler with scene mutation callbacks.
 * @param deps Clip/tools setup dependencies.
 * @returns Configured clip plane handler.
 */
function createClipPlaneHandler(deps: ClipToolsSetupDeps): ClipPlaneHandler {
  return new ClipPlaneHandler({
    worldObject: deps.worldObject,
    commandStack: deps.commandStack,
    selectionManager: deps.selectionManager,
    gridSnap: deps.gridSnap,
    clipPlaneTool: deps.clipPlaneTool,
    showStatusMessage: deps.showStatusMessage,
    syncPrimitivesToViewports: deps.syncPrimitivesToViewports,
    refreshOutliner: deps.refreshOutliner,
    updateShadingMeshes: deps.updateShadingMeshes,
    onToolStateChanged: deps.onToolStateChanged
  });
}

/**
 * Builds the tools palette UI with deferred controller callbacks.
 * @param deps Clip/tools setup dependencies.
 * @param controllerHolder Mutable holder filled after controller construction.
 * @param clipPlaneHandler Clip plane handler for commit/flip actions.
 * @returns Created tools palette.
 */
function createToolsPalette(
  deps: ClipToolsSetupDeps,
  controllerHolder: { current: ToolsPaletteController | null },
  clipPlaneHandler: ClipPlaneHandler
): ToolsPalette {
  return new ToolsPalette(
    deps.toolbarContainer,
    {
      onSelectTool: (toolId) => controllerHolder.current?.selectTool(toolId),
      onTransformMode: (mode) => deps.onTransformMode(mode),
      onFlipClipPlane: () => clipPlaneHandler.flipPlane(),
      onCommitClip: () => clipPlaneHandler.commitClip(),
      onCommitSplit: () => clipPlaneHandler.commitSplit(),
      onOpenUvEditor: () => deps.onOpenUvEditor(),
      onExtrudeFaces: () => deps.onExtrudeFaces()
    },
    deps.anchorViewport
  );
}

/**
 * Creates the tools palette controller for selection-mode tool switching.
 * @param deps Clip/tools setup dependencies.
 * @param toolsPalette Tools palette panel.
 * @param clipPlaneHandler Clip plane handler.
 * @returns Configured tools palette controller.
 */
function createToolsPaletteController(
  deps: ClipToolsSetupDeps,
  toolsPalette: ToolsPalette,
  clipPlaneHandler: ClipPlaneHandler
): ToolsPaletteController {
  return new ToolsPaletteController({
    toolsPalette,
    faceExtrusionController: deps.faceExtrusionController,
    clipPlaneTool: deps.clipPlaneTool,
    clipPlaneHandler,
    selectionManager: deps.selectionManager,
    showStatusMessage: deps.showStatusMessage
  });
}

/**
 * Wires clip plane pointer callbacks on all viewports.
 * @param deps Clip/tools setup dependencies.
 * @param clipPlaneHandler Clip plane handler receiving pointer events.
 */
function wireClipPlaneViewportCallbacks(
  deps: ClipToolsSetupDeps,
  clipPlaneHandler: ClipPlaneHandler
): void {
  const viewports = [
    deps.viewport3D,
    deps.viewport2DTop,
    deps.viewport2DFront,
    deps.viewport2DSide
  ];
  viewports.forEach((viewport) => {
    viewport.setClipPlaneCallback((event) => {
      return clipPlaneHandler.onPointerDown(
        event,
        viewport.getCamera(),
        viewport.getRenderer()
      );
    });
  });
}

/**
 * Wires keyboard shortcuts used while the clip plane tool is active.
 * @param deps Clip/tools setup dependencies.
 * @param clipPlaneHandler Clip plane handler for flip/commit actions.
 */
function wireClipPlaneKeyboardShortcuts(
  deps: ClipToolsSetupDeps,
  clipPlaneHandler: ClipPlaneHandler
): void {
  deps.keyboardShortcutHandler.setClipPlaneShortcuts(
    () => deps.clipPlaneTool.isActive(),
    () => clipPlaneHandler.flipPlane(),
    () => clipPlaneHandler.commitClip(),
    () => clipPlaneHandler.commitSplit(),
    () => deps.onClipCancel()
  );
}

/**
 * Cancels the clip tool and returns the palette to object select.
 * @param clipPlaneHandler Active clip plane handler, if any.
 * @param toolsPaletteController Tools palette controller, if any.
 */
export function cancelClipAndSelectObject(
  clipPlaneHandler: ClipPlaneHandler | null,
  toolsPaletteController: ToolsPaletteController | null
): void {
  clipPlaneHandler?.cancel();
  toolsPaletteController?.selectTool(EditorToolId.OBJECT);
}
