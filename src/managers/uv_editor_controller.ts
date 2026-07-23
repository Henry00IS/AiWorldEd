import { CommandStack } from '../commands/command_stack.js';
import { ApplyFaceTextureCommand } from '../commands/apply_face_texture_command.js';
import { SelectionManager } from './selection_manager.js';
import { FaceExtrusionController } from './face_extrusion_controller.js';
import { SelectionMode } from '../types/selection_mode.js';
import {
  FaceTextureAlign,
  FaceTextureMapping,
  createDefaultFaceTextureMapping
} from '../texture/face_texture_mapping.js';
import {
  TextureApplyTarget,
  buildTargetsFromFaceSelection,
  buildTargetsFromMeshes,
  getCommonMapping
} from '../texture/face_texture_applier.js';

/**
 * Callback for status messages.
 * @param message Status text.
 */
export type UvEditorStatusCallback = (message: string) => void;

/**
 * Callback when UV editor field values should refresh.
 * @param mapping Common mapping or null when mixed/empty.
 * @param targetCount Number of face regions targeted.
 */
export type UvEditorUiRefreshCallback = (
  mapping: FaceTextureMapping | null,
  targetCount: number
) => void;

/**
 * Coordinates UV editor actions with selection and undo.
 */
export class UvEditorController {
  private selectionManager: SelectionManager;
  private faceExtrusionController: FaceExtrusionController;
  private commandStack: CommandStack;
  private statusCallback: UvEditorStatusCallback | null;
  private uiRefreshCallback: UvEditorUiRefreshCallback | null;

  /**
   * Creates a UV editor controller.
   * @param selectionManager Object selection manager.
   * @param faceExtrusionController Face selection / mode owner.
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
    this.uiRefreshCallback = null;
  }

  /**
   * Registers a status message callback.
   * @param callback Status handler.
   */
  setStatusCallback(callback: UvEditorStatusCallback | null): void {
    this.statusCallback = callback;
  }

  /**
   * Registers a UI refresh callback for mixed-value display.
   * @param callback UI refresh handler.
   */
  setUiRefreshCallback(callback: UvEditorUiRefreshCallback | null): void {
    this.uiRefreshCallback = callback;
  }

  /**
   * Refreshes UV editor fields from the current selection.
   */
  refreshFromSelection(): void {
    const targets = this.collectTargets();
    const common = getCommonMapping(targets);
    if (this.uiRefreshCallback) {
      this.uiRefreshCallback(common, targets.length);
    }
  }

  /**
   * Applies an align preset without clobbering per-region scale/offset.
   * @param align Align mode.
   */
  applyAlign(align: FaceTextureAlign): void {
    const targets = this.collectTargets();
    if (targets.length === 0) {
      this.reportNoSelection();
      return;
    }
    const command = new ApplyFaceTextureCommand(
      targets,
      createDefaultFaceTextureMapping(),
      { alignOnly: align }
    );
    this.commandStack.push(command);
    this.statusCallback?.(`Aligned ${targets.length} face region(s) to ${align}`);
    this.refreshFromSelection();
  }

  /**
   * Applies scale/offset/rotation values from the UV editor.
   * @param mapping Mapping fields read from the UV editor form.
   */
  applyMappingFields(mapping: FaceTextureMapping): void {
    const targets = this.collectTargets();
    if (targets.length === 0) {
      this.reportNoSelection();
      return;
    }
    this.pushApplyCommand(targets, mapping);
    this.statusCallback?.(`Updated texture on ${targets.length} face region(s)`);
    this.refreshFromSelection();
  }

  /**
   * Resets UV projection params to defaults without clearing texture assignments.
   */
  resetMapping(): void {
    const targets = this.collectTargets();
    if (targets.length === 0) {
      this.reportNoSelection();
      return;
    }
    const command = new ApplyFaceTextureCommand(
      targets,
      createDefaultFaceTextureMapping(),
      { resetUvOnly: true }
    );
    this.commandStack.push(command);
    this.statusCallback?.(
      `Reset UVs on ${targets.length} face region(s)`
    );
    this.refreshFromSelection();
  }

  /**
   * Collects texture targets from face selection or whole objects.
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

  /**
   * Pushes an undoable apply command.
   * @param targets Regions.
   * @param mapping Mapping to apply.
   */
  private pushApplyCommand(
    targets: TextureApplyTarget[],
    mapping: FaceTextureMapping
  ): void {
    const command = new ApplyFaceTextureCommand(targets, mapping);
    this.commandStack.push(command);
  }

  /**
   * Reports that no valid selection is available.
   */
  private reportNoSelection(): void {
    this.statusCallback?.(
      'Select face(s) in Face mode, or object(s) in Object mode'
    );
  }
}
