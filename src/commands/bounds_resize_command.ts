import * as THREE from 'three';
import { UndoCommand } from './undo_command.js';

/**
 * Snapshot of mesh pose before a bounds resize drag.
 * Final values store the post-drag result so execute stays idempotent.
 */
export interface BoundsResizeSnapshot {
  object: THREE.Mesh;
  originalPosition: THREE.Vector3;
  originalScale: THREE.Vector3;
  finalPosition: THREE.Vector3;
  finalScale: THREE.Vector3;
}

/**
 * Undoable command for one-sided bounds resize operations.
 * Restores position and scale together so the opposite face stays correct.
 */
export class BoundsResizeCommand implements UndoCommand {
  private snapshots: BoundsResizeSnapshot[];

  /**
   * Creates a bounds resize command from per-object snapshots.
   * @param snapshots Position and scale before/after the resize.
   */
  constructor(snapshots: BoundsResizeSnapshot[]) {
    this.snapshots = snapshots.map((snapshot) => this.cloneSnapshot(snapshot));
  }

  /**
   * Applies the final post-drag positions and scales.
   */
  execute(): void {
    this.snapshots.forEach((snapshot) => {
      snapshot.object.position.copy(snapshot.finalPosition);
      snapshot.object.scale.copy(snapshot.finalScale);
    });
  }

  /**
   * Restores pre-drag positions and scales.
   */
  undo(): void {
    this.snapshots.forEach((snapshot) => {
      snapshot.object.position.copy(snapshot.originalPosition);
      snapshot.object.scale.copy(snapshot.originalScale);
    });
  }

  /**
   * Deep-clones vector fields on a snapshot.
   * @param snapshot The snapshot to clone.
   * @returns An independent snapshot copy.
   */
  private cloneSnapshot(snapshot: BoundsResizeSnapshot): BoundsResizeSnapshot {
    return {
      object: snapshot.object,
      originalPosition: snapshot.originalPosition.clone(),
      originalScale: snapshot.originalScale.clone(),
      finalPosition: snapshot.finalPosition.clone(),
      finalScale: snapshot.finalScale.clone()
    };
  }
}
