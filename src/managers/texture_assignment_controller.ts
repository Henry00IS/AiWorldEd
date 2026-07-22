import { CommandStack } from '../commands/command_stack.js';
import { AssignSurfaceTextureCommand } from '../commands/assign_surface_texture_command.js';
import { SelectionManager } from './selection_manager.js';
import { FaceExtrusionController } from './face_extrusion_controller.js';
import { SelectionMode } from '../types/selection_mode.js';
import {
  TextureApplyTarget,
  buildTargetsFromFaceSelection,
  buildTargetsFromMeshes
} from '../texture/face_texture_applier.js';
import { getTexturePaintState } from '../texture/texture_paint_state.js';
import { TextureBrowserEntry } from '../texture/texture_browser_entry.js';

/**
 * Callback for status messages after texture assignment.
 * @param message Status text.
 */
export type TextureAssignmentStatusCallback = (message: string) => void;

/**
 * Assigns the selected browser texture to the current face/object selection.
 */
export class TextureAssignmentController {
  private selectionManager: SelectionManager;
  private faceExtrusionController: FaceExtrusionController;
  private commandStack: CommandStack;
  private statusCallback: TextureAssignmentStatusCallback | null;

  /**
   * Creates a texture assignment controller.
   * @param selectionManager Object selection.
   * @param faceExtrusionController Face selection / mode.
   * @param commandStack Undo stack.
   */
  constructor(
    selectionManager: SelectionManager,
    faceExtrusionController: FaceExtrusionController,
    commandStack: CommandStack
  ) {
    this.selectionManager = selectionManager;
    this.faceExtrusionController = faceExtrusionController;
    this.commandStack = commandStack;
    this.statusCallback = null;
  }

  /**
   * Registers a status callback.
   * @param callback Status handler, or null.
   */
  setStatusCallback(callback: TextureAssignmentStatusCallback | null): void {
    this.statusCallback = callback;
  }

  /**
   * Records paint texture and assigns it to the current selection when any.
   * @param entry Selected browser entry.
   */
  onTextureSelected(entry: TextureBrowserEntry): void {
    getTexturePaintState().setLastTextureId(entry.id);
    const targets = this.collectTargets();
    if (targets.length === 0) {
      this.statusCallback?.(
        `Paint texture: ${entry.displayName} (select faces or objects to assign)`
      );
      return;
    }
    this.assignTextureToTargets(targets, entry);
  }

  /**
   * Pushes an undoable assignment for the given targets.
   * @param targets Regions to paint.
   * @param entry Texture to apply.
   */
  private assignTextureToTargets(
    targets: TextureApplyTarget[],
    entry: TextureBrowserEntry
  ): void {
    const command = new AssignSurfaceTextureCommand(targets, entry.id);
    this.commandStack.push(command);
    this.statusCallback?.(
      `Assigned ${entry.displayName} to ${targets.length} surface region(s)`
    );
  }

  /**
   * Collects assign targets from face selection or whole objects.
   * @returns Apply targets.
   */
  private collectTargets(): TextureApplyTarget[] {
    const mode = this.faceExtrusionController.getSelectionMode();
    if (mode === SelectionMode.FACE) {
      const faces = this.faceExtrusionController.getSelectedFaces();
      if (faces.length > 0) return buildTargetsFromFaceSelection(faces);
    }
    const meshes = this.selectionManager.getAllSelectedObjectsAsArray();
    if (meshes.length === 0) return [];
    return buildTargetsFromMeshes(meshes);
  }
}
