import { ToolsPalette } from '../ui/tools_palette.js';
import { EditorToolId } from '../types/editor_tool_id.js';
import { SelectionMode } from '../types/selection_mode.js';
import { FaceExtrusionController } from './face_extrusion_controller.js';
import { ClipPlaneTool } from './clip_plane_tool.js';
import { ClipPlaneHandler } from './clip_plane_handler.js';
import { SelectionManager } from './selection_manager.js';

/**
 * Dependencies for coordinating the Tools palette with editor modes.
 */
export interface ToolsPaletteControllerDependencies {
  toolsPalette: ToolsPalette;
  faceExtrusionController: FaceExtrusionController;
  clipPlaneTool: ClipPlaneTool;
  clipPlaneHandler: ClipPlaneHandler;
  selectionManager: SelectionManager;
  showStatusMessage: (message: string) => void;
}

/**
 * Keeps the Tools palette, face mode, and clip tool mutually exclusive.
 */
export class ToolsPaletteController {
  private deps: ToolsPaletteControllerDependencies;
  private activeTool: EditorToolId;

  /**
   * Creates a tools palette controller.
   * @param deps Shared tool systems.
   */
  constructor(deps: ToolsPaletteControllerDependencies) {
    this.deps = deps;
    this.activeTool = EditorToolId.OBJECT;
    this.deps.toolsPalette.setActiveTool(EditorToolId.OBJECT);
    this.refreshPaletteContext();
  }

  /**
   * Returns the active interactive tool.
   * @returns Current EditorToolId.
   */
  getActiveTool(): EditorToolId {
    return this.activeTool;
  }

  /**
   * Returns whether the clip plane tool is the active tool.
   * @returns True when clip mode is live.
   */
  isClipToolActive(): boolean {
    return this.activeTool === EditorToolId.CLIP_PLANE
      && this.deps.clipPlaneTool.isActive();
  }

  /**
   * Activates a tool from the palette or shortcuts.
   * @param toolId Tool to activate.
   */
  selectTool(toolId: EditorToolId): void {
    if (toolId === EditorToolId.OBJECT) {
      this.activateObjectTool();
      return;
    }
    if (toolId === EditorToolId.FACE) {
      this.activateFaceTool();
      return;
    }
    this.activateClipTool();
  }

  /**
   * Syncs palette highlight when selection mode changes externally (Tab).
   * @param mode New selection mode.
   */
  onExternalSelectionModeChanged(mode: SelectionMode): void {
    if (this.activeTool === EditorToolId.CLIP_PLANE) {
      this.deps.clipPlaneTool.deactivate();
    }
    this.activeTool = mode === SelectionMode.FACE
      ? EditorToolId.FACE
      : EditorToolId.OBJECT;
    this.deps.toolsPalette.setActiveTool(this.activeTool);
    this.refreshPaletteContext();
  }

  /**
   * Refreshes palette status and clip button enablement.
   */
  refreshPaletteContext(): void {
    this.deps.toolsPalette.setActiveTool(this.activeTool);
    if (this.activeTool === EditorToolId.CLIP_PLANE) {
      this.deps.toolsPalette.setContextStatus(
        this.deps.clipPlaneTool.getStatusMessage()
      );
      this.deps.toolsPalette.setClipActionsEnabled(
        this.deps.clipPlaneTool.isPlaneReady()
      );
      return;
    }
    this.deps.toolsPalette.setClipActionsEnabled(false);
    if (this.activeTool === EditorToolId.FACE) {
      this.deps.toolsPalette.setContextStatus(
        'Click faces · open UV Editor or Extrude'
      );
      return;
    }
    this.deps.toolsPalette.setContextStatus(
      'Transform modes · select objects in the viewport'
    );
  }

  /**
   * Activates object selection mode.
   */
  private activateObjectTool(): void {
    this.deps.clipPlaneTool.deactivate();
    this.deps.faceExtrusionController.setSelectionMode(SelectionMode.OBJECT);
    this.activeTool = EditorToolId.OBJECT;
    this.deps.toolsPalette.setActiveTool(this.activeTool);
    this.refreshPaletteContext();
    this.deps.showStatusMessage('Object select');
  }

  /**
   * Activates face selection mode.
   */
  private activateFaceTool(): void {
    this.deps.clipPlaneTool.deactivate();
    this.deps.faceExtrusionController.setSelectionMode(SelectionMode.FACE);
    this.activeTool = EditorToolId.FACE;
    this.deps.toolsPalette.setActiveTool(this.activeTool);
    this.refreshPaletteContext();
    this.deps.showStatusMessage('Face select');
  }

  /**
   * Activates the clip plane tool when a mesh is selected.
   */
  private activateClipTool(): void {
    const selected = this.deps.selectionManager.getAllSelectedObjectsAsArray();
    if (selected.length === 0) {
      this.deps.showStatusMessage('Select a mesh to clip');
      this.deps.toolsPalette.setContextStatus('Select a mesh to clip');
      return;
    }
    this.deps.faceExtrusionController.setSelectionMode(SelectionMode.OBJECT);
    this.deps.clipPlaneTool.activate();
    this.activeTool = EditorToolId.CLIP_PLANE;
    this.deps.toolsPalette.setActiveTool(this.activeTool);
    this.refreshPaletteContext();
    this.deps.showStatusMessage(this.deps.clipPlaneTool.getStatusMessage());
  }
}
