import * as THREE from 'three';
import { UndoCommand } from './undo_command.js';
import { SolidModel } from '../solid/model/solid_model.js';

/**
 * Undoable command that adds a solid model group to the scene.
 */
export class CreateSolidModelCommand implements UndoCommand {
  private readonly model: SolidModel;
  private readonly parent: THREE.Object3D;

  /**
   * Creates a create-solid-model command.
   * @param model Solid model to add.
   * @param parent Parent object that will own the solid model root.
   */
  constructor(model: SolidModel, parent: THREE.Object3D) {
    this.model = model;
    this.parent = parent;
  }

  /**
   * Adds the solid model root to the parent when not already parented.
   */
  execute(): void {
    if (this.model.root.parent) return;
    this.parent.add(this.model.root);
  }

  /**
   * Removes the solid model root without disposing so redo can re-add it.
   */
  undo(): void {
    if (this.model.root.parent) {
      this.model.root.parent.remove(this.model.root);
    }
  }

  /**
   * Returns the solid model created by this command.
   * @returns Solid model instance.
   */
  getModel(): SolidModel {
    return this.model;
  }
}
