import * as THREE from 'three';
import { UndoCommand } from '@/commands/command_undo.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { modifierBevelRefreshAfterVisibility } from '@/modifier/compile/modifier_bevel_scene_refresh.js';

/**
 * Undoable command for toggling the visibility of a Three.js object. Solid
 * brushes also leave or re-enter CSG evaluation via partial rebuild.
 */
export class CommandObjectVisibilityToggle implements UndoCommand {
  private object: THREE.Object3D;
  private previousVisibility: boolean;
  private newVisibility: boolean;
  private executed: boolean;

  /**
   * Creates a new toggle visibility command for the specified object.
   *
   * @param object The Three.js object whose visibility to toggle.
   */
  constructor(object: THREE.Object3D) {
    this.object = object;
    this.previousVisibility = object.visible;
    this.newVisibility = !object.visible;
    this.executed = false;
  }

  /** Executes the visibility toggle by setting the new visibility state. */
  execute(): void {
    if (this.executed) return;
    this.object.visible = this.newVisibility;
    this.syncSolidBrushCsgVisibility();
    this.executed = true;
  }

  /** Undoes the toggle by restoring the object's previous visibility state. */
  undo(): void {
    this.object.visible = this.previousVisibility;
    this.syncSolidBrushCsgVisibility();
    this.executed = false;
  }

  /**
   * When the object is a solid brush, updates CSG membership for the new
   * visibility using the model's partial recompile path, then re-evaluates
   * modifier volumes so a shown or hidden volume, group, captured brush or cap
   * takes effect at once.
   */
  private syncSolidBrushCsgVisibility(): void {
    const model = SolidModel.fromObject(this.object);
    if (model) model.applyBrushVisibilityChange(this.object);
    modifierBevelRefreshAfterVisibility(this.object);
  }

  /**
   * Returns the new visibility state set by this command.
   *
   * @returns True if the object is made visible, false otherwise.
   */
  getNewVisibility(): boolean {
    return this.newVisibility;
  }
}
