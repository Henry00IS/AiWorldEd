import * as THREE from 'three';
import { CommandStack } from '@/commands/command_stack.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import { CommandTextureFaceApply } from '@/texture/commands/command_texture_face_apply.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { ControllerFaceExtrusion } from '@/tools/face/controller_face_extrusion.js';
import { SelectionMode } from '@/types/selection_mode.js';
import {
  FaceTextureAlign,
  FaceTextureMapping,
  FaceTextureMappingTrs,
  createDefaultFaceTextureMapping,
} from '@/texture/uv/face_texture_mapping.js';
import {
  TextureApplyTarget,
  UvEditorTrsFieldState,
  buildTargetsFromFaceSelection,
  buildTargetsFromMeshes,
  getCommonTrsFieldState,
} from '@/texture/uv/face_texture_applier.js';
import type { UvRelativeTrsOp } from '@/texture/uv/uv_trs_ops.js';

/**
 * Callback for status messages.
 *
 * @param message Status text.
 */
export type UvEditorStatusCallback = (message: string) => void;

/**
 * Callback when UV editor field values should refresh.
 *
 * @param fields Per-field shared or mixed TRS state.
 */
export type UvEditorUiRefreshCallback = (fields: UvEditorTrsFieldState) => void;

/** Coordinates UV editor actions with selection and undo. */
export class ControllerUvEditor {
  private selectionManager: ManagerSelection;
  private faceExtrusionController: ControllerFaceExtrusion;
  private commandStack: CommandStack;
  private statusCallback: UvEditorStatusCallback | null;
  private uiRefreshCallback: UvEditorUiRefreshCallback | null;

  /**
   * Creates a UV editor controller.
   *
   * @param selectionManager Object selection manager.
   * @param faceExtrusionController Face selection / mode owner.
   * @param commandStack Undo stack.
   */
  constructor(
    selectionManager: ManagerSelection,
    faceExtrusionController: ControllerFaceExtrusion,
    commandStack: CommandStack,
  ) {
    this.selectionManager = selectionManager;
    this.faceExtrusionController = faceExtrusionController;
    this.commandStack = commandStack;
    this.statusCallback = null;
    this.uiRefreshCallback = null;
  }

  /**
   * Registers a status message callback.
   *
   * @param callback Status handler.
   */
  setStatusCallback(callback: UvEditorStatusCallback | null): void {
    this.statusCallback = callback;
  }

  /**
   * Registers a UI refresh callback for mixed-value display.
   *
   * @param callback UI refresh handler.
   */
  setUiRefreshCallback(callback: UvEditorUiRefreshCallback | null): void {
    this.uiRefreshCallback = callback;
  }

  /** Refreshes UV editor fields from the current selection. */
  refreshFromSelection(): void {
    const targets = this.collectTargets();
    const fields = getCommonTrsFieldState(targets);
    if (this.uiRefreshCallback) {
      this.uiRefreshCallback(fields);
    }
  }

  /**
   * Applies an align preset without clobbering per-region scale/offset. Faces
   * where the align would collapse UVs are skipped.
   *
   * @param align Align mode.
   */
  applyAlign(align: FaceTextureAlign): void {
    const targets = this.collectTargets();
    if (targets.length === 0) {
      this.reportNoSelection();
      return;
    }
    const command = new CommandTextureFaceApply(targets, createDefaultFaceTextureMapping(), {
      alignOnly: align,
    });
    this.commandStack.push(command);
    this.statusCallback?.(`Aligned selection to ${align} (skipped incompatible faces)`);
    this.refreshFromSelection();
  }

  /**
   * Applies full mapping fields (legacy absolute apply when all fields known).
   *
   * @param mapping Mapping fields read from the UV editor form.
   */
  applyMappingFields(mapping: FaceTextureMapping): void {
    const targets = this.collectTargets();
    if (targets.length === 0) {
      this.reportNoSelection();
      return;
    }
    this.pushApplyCommand(targets, mapping);
    this.statusCallback?.(`Updated UV on ${targets.length} face region(s)`);
    this.refreshFromSelection();
  }

  /**
   * Applies absolute TRS field overrides to every selected region. Only
   * provided fields change (Unity multi-edit: type into a dashed field to set
   * all).
   *
   * @param fields Partial absolute TRS fields.
   */
  applyPartialTrsFields(fields: Partial<FaceTextureMappingTrs>): void {
    if (Object.keys(fields).length === 0) return;
    const targets = this.collectTargets();
    if (targets.length === 0) {
      this.reportNoSelection();
      return;
    }
    const command = new CommandTextureFaceApply(targets, createDefaultFaceTextureMapping(), {
      partialTrs: fields,
    });
    this.commandStack.push(command);
    this.statusCallback?.(`Updated UV fields on ${targets.length} face region(s)`);
    this.refreshFromSelection();
  }

  /**
   * Applies a relative TRS op to every selected region (buttons work even when
   * numeric fields show mixed dashes).
   *
   * @param op Relative operation.
   */
  applyRelativeOp(op: UvRelativeTrsOp): void {
    const targets = this.collectTargets();
    if (targets.length === 0) {
      this.reportNoSelection();
      return;
    }
    const command = new CommandTextureFaceApply(targets, createDefaultFaceTextureMapping(), {
      relativeOp: op,
    });
    this.commandStack.push(command);
    this.statusCallback?.(describeRelativeOp(op, targets.length));
    this.refreshFromSelection();
  }

  /**
   * Resets UV projection params to defaults without clearing texture
   * assignments.
   */
  resetMapping(): void {
    const targets = this.collectTargets();
    if (targets.length === 0) {
      this.reportNoSelection();
      return;
    }
    const command = new CommandTextureFaceApply(targets, createDefaultFaceTextureMapping(), {
      resetUvOnly: true,
    });
    this.commandStack.push(command);
    this.statusCallback?.(`Reset UVs on ${targets.length} face region(s)`);
    this.refreshFromSelection();
  }

  /**
   * Collects texture targets from face selection or whole objects.
   *
   * @returns Apply targets, with bevel volumes left out.
   */
  private collectTargets(): TextureApplyTarget[] {
    if (this.faceModeHasFaces()) {
      return this.collectFaceModeTargets();
    }
    return buildTargetsFromMeshes(this.editableSelectedMeshes());
  }

  /**
   * Returns whether the current mode is face mode with a face selected.
   *
   * @returns True when face mode has one or more selected faces.
   */
  private faceModeHasFaces(): boolean {
    if (this.faceExtrusionController.getSelectionMode() !== SelectionMode.FACE) {
      return false;
    }
    return this.faceExtrusionController.getSelectedFaces().length > 0;
  }

  /**
   * Returns apply targets for the current face selection.
   *
   * @returns Targets for faces whose mesh is not a bevel volume.
   */
  private collectFaceModeTargets(): TextureApplyTarget[] {
    if (this.faceExtrusionController.getSelectionMode() !== SelectionMode.FACE) {
      return [];
    }
    const faces = this.faceExtrusionController.getSelectedFaces();
    const editable = faces.filter((face) => !ModifierVolumeBevel.isVolume(face.mesh));
    if (editable.length === 0) {
      return [];
    }
    return buildTargetsFromFaceSelection(editable);
  }

  /**
   * Returns selected meshes that accept UV edits.
   *
   * @returns Selected meshes excluding bevel volumes.
   */
  private editableSelectedMeshes(): THREE.Mesh[] {
    return this.selectionManager.getAllSelectedObjectsAsArray().filter((mesh) => !ModifierVolumeBevel.isVolume(mesh));
  }

  /**
   * Pushes an undoable apply command.
   *
   * @param targets Regions.
   * @param mapping Mapping to apply.
   */
  private pushApplyCommand(targets: TextureApplyTarget[], mapping: FaceTextureMapping): void {
    const command = new CommandTextureFaceApply(targets, mapping);
    this.commandStack.push(command);
  }

  /** Reports that no valid selection is available. */
  private reportNoSelection(): void {
    this.statusCallback?.('Select face(s) in Face mode, or object(s) in Object mode');
  }
}

/**
 * Builds a short status string for a relative UV op.
 *
 * @param op Relative operation.
 * @param count Target count.
 * @returns Status message.
 */
function describeRelativeOp(op: UvRelativeTrsOp, count: number): string {
  const suffix = `${count} face region(s)`;
  if (op.kind === 'multiplyScale') {
    return `Scaled ${op.axis.toUpperCase()} ×${op.factor} on ${suffix}`;
  }
  if (op.kind === 'addOffset') {
    const sign = op.delta >= 0 ? '+' : '';
    return `Offset ${op.axis.toUpperCase()} ${sign}${op.delta} on ${suffix}`;
  }
  const sign = op.degrees >= 0 ? '+' : '';
  return `Rotated UV ${sign}${op.degrees}° on ${suffix}`;
}
