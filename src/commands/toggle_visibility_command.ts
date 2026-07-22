import * as THREE from 'three';
import { UndoCommand } from './undo_command.js';

/**
 * Undoable command for toggling the visibility of a Three.js object.
 * Stores the previous visibility state to support undo restoration.
 */
export class ToggleVisibilityCommand implements UndoCommand {
  private object: THREE.Object3D;
  private previousVisibility: boolean;
  private newVisibility: boolean;
  private executed: boolean;

  /**
   * Creates a new toggle visibility command for the specified object.
   * @param object The Three.js object whose visibility to toggle.
   */
  constructor(object: THREE.Object3D) {
    this.object = object;
    this.previousVisibility = object.visible;
    this.newVisibility = !object.visible;
    this.executed = false;
  }

  /**
   * Executes the visibility toggle by setting the new visibility state.
   */
  execute(): void {
    if (this.executed) return;
    this.object.visible = this.newVisibility;
    this.executed = true;
  }

  /**
   * Undoes the toggle by restoring the object's previous visibility state.
   */
  undo(): void {
    this.object.visible = this.previousVisibility;
    this.executed = false;
  }

  /**
   * Returns the new visibility state set by this command.
   * @returns True if the object is made visible, false otherwise.
   */
  getNewVisibility(): boolean {
    return this.newVisibility;
  }
}
