import * as THREE from 'three';
import { UndoCommand } from './undo_command.js';

/**
 * Snapshot of an object's position for undo/restore operations.
 */
export interface ObjectPositionSnapshot {
  object: THREE.Object3D;
  position: THREE.Vector3;
}

/**
 * Undoable command that sets the position of one or more objects.
 * Snapshots original positions on construction and restores them on undo.
 */
export class SetPositionCommand implements UndoCommand {
  private snapshots: ObjectPositionSnapshot[];
  private newPositions: THREE.Vector3[];

  /**
   * Creates a new set position command.
   * Captures each object's current position as the undo state.
   * @param objects The objects whose positions will be changed.
   * @param newPositions The target positions corresponding to each object.
   */
  constructor(objects: THREE.Object3D[], newPositions: THREE.Vector3[]) {
    this.snapshots = [];
    this.newPositions = [];
    for (let i = 0; i < objects.length; i++) {
      this.snapshots.push({
        object: objects[i],
        position: objects[i].position.clone()
      });
      this.newPositions.push(newPositions[i].clone());
    }
  }

  /**
   * Executes the command by setting each object's position to its new value.
   */
  execute(): void {
    for (let i = 0; i < this.snapshots.length; i++) {
      this.snapshots[i].object.position.copy(this.newPositions[i]);
    }
  }

  /**
   * Undoes the command by restoring each object's original position.
   */
  undo(): void {
    for (let i = 0; i < this.snapshots.length; i++) {
      this.snapshots[i].object.position.copy(this.snapshots[i].position);
    }
  }
}
