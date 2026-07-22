import * as THREE from 'three';
import { UndoCommand } from './undo_command.js';

/**
 * Undoable command for renaming a Three.js object.
 * Stores the previous name to support undo restoration.
 */
export class RenameCommand implements UndoCommand {
  private object: THREE.Object3D;
  private newName: string;
  private previousName: string;

  /**
   * Creates a new rename command for the specified object.
   * @param object The Three.js object to rename.
   * @param newName The new name to assign to the object.
   */
  constructor(object: THREE.Object3D, newName: string) {
    this.object = object;
    this.newName = newName;
    this.previousName = object.name;
  }

  /**
   * Executes the rename by setting the object's name property.
   */
  execute(): void {
    this.object.name = this.newName;
  }

  /**
   * Undoes the rename by restoring the object's previous name.
   */
  undo(): void {
    this.object.name = this.previousName;
  }
}
