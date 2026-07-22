import * as THREE from 'three';
import { UndoCommand } from './undo_command.js';

/**
 * Snapshot of an object's rotation for undo/restore operations.
 */
export interface ObjectRotationSnapshot {
  object: THREE.Object3D;
  rotation: THREE.Euler;
}

/**
 * Undoable command that sets the rotation of one or more objects.
 * Snapshots original rotations on construction and restores them on undo.
 */
export class SetRotationCommand implements UndoCommand {
  private snapshots: ObjectRotationSnapshot[];
  private newRotations: THREE.Euler[];

  /**
   * Creates a new set rotation command.
   * Captures each object's current rotation as the undo state.
   * @param objects The objects whose rotations will be changed.
   * @param newRotations The target Euler rotations corresponding to each object.
   */
  constructor(objects: THREE.Object3D[], newRotations: THREE.Euler[]) {
    this.snapshots = [];
    this.newRotations = [];
    for (let i = 0; i < objects.length; i++) {
      this.snapshots.push({
        object: objects[i],
        rotation: objects[i].rotation.clone()
      });
      this.newRotations.push(newRotations[i].clone());
    }
  }

  /**
   * Executes the command by setting each object's rotation to its new value.
   */
  execute(): void {
    for (let i = 0; i < this.snapshots.length; i++) {
      this.snapshots[i].object.rotation.copy(this.newRotations[i]);
    }
  }

  /**
   * Undoes the command by restoring each object's original rotation.
   */
  undo(): void {
    for (let i = 0; i < this.snapshots.length; i++) {
      this.snapshots[i].object.rotation.copy(this.snapshots[i].rotation);
    }
  }
}
