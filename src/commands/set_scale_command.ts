import * as THREE from 'three';
import { UndoCommand } from './undo_command.js';

/**
 * Snapshot of an object's scale for undo/restore operations.
 */
export interface ObjectScaleSnapshot {
  object: THREE.Object3D;
  scale: THREE.Vector3;
}

/**
 * Undoable command that sets the scale of one or more objects.
 * Snapshots original scales on construction and restores them on undo.
 */
export class SetScaleCommand implements UndoCommand {
  private snapshots: ObjectScaleSnapshot[];
  private newScales: THREE.Vector3[];

  /**
   * Creates a new set scale command.
   * Captures each object's current scale as the undo state.
   * @param objects The objects whose scales will be changed.
   * @param newScales The target scales corresponding to each object.
   */
  constructor(objects: THREE.Object3D[], newScales: THREE.Vector3[]) {
    this.snapshots = [];
    this.newScales = [];
    for (let i = 0; i < objects.length; i++) {
      this.snapshots.push({
        object: objects[i],
        scale: objects[i].scale.clone()
      });
      this.newScales.push(newScales[i].clone());
    }
  }

  /**
   * Executes the command by setting each object's scale to its new value.
   */
  execute(): void {
    for (let i = 0; i < this.snapshots.length; i++) {
      this.snapshots[i].object.scale.copy(this.newScales[i]);
    }
  }

  /**
   * Undoes the command by restoring each object's original scale.
   */
  undo(): void {
    for (let i = 0; i < this.snapshots.length; i++) {
      this.snapshots[i].object.scale.copy(this.snapshots[i].scale);
    }
  }
}
