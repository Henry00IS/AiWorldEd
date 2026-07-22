import * as THREE from 'three';
import { UndoCommand } from './undo_command.js';

/**
 * Snapshot of an object's position before a transform operation.
 * Optional finalPosition records the post-drag snapped result.
 */
export interface ObjectTransformSnapshot {
  object: THREE.Mesh;
  position: THREE.Vector3;
  finalPosition?: THREE.Vector3;
}

/**
 * Undoable command for translate (move) operations.
 * Prefers explicit final positions so grid snapping is preserved on drag end.
 * Falls back to a shared delta when final positions are not provided.
 */
export class TranslateCommand implements UndoCommand {
  private snapshots: ObjectTransformSnapshot[];
  private delta: THREE.Vector3;

  /**
   * Creates a new translate command.
   * @param snapshots The position snapshots of all affected objects.
   * @param delta Fallback translation delta when finalPosition is absent.
   */
  constructor(snapshots: ObjectTransformSnapshot[], delta: THREE.Vector3) {
    this.snapshots = snapshots;
    this.delta = delta.clone();
  }

  /**
   * Applies the final (or delta-derived) positions to each object.
   */
  execute(): void {
    this.snapshots.forEach((snapshot) => {
      if (snapshot.finalPosition) {
        snapshot.object.position.copy(snapshot.finalPosition);
        return;
      }
      snapshot.object.position.copy(snapshot.position).add(this.delta);
    });
  }

  /**
   * Restores each object to its pre-drag position.
   */
  undo(): void {
    this.snapshots.forEach((snapshot) => {
      snapshot.object.position.copy(snapshot.position);
    });
  }
}
