import type * as THREE from 'three';
import type { UndoCommand } from '@/commands/command_undo.js';
import { objectPivotMove, objectPivotRestore, type ObjectPivotSnapshot } from './object_pivot_move.js';

/** One origin move: the object and the world point its origin goes to. */
export interface ObjectPivotTarget {
  object: THREE.Object3D;
  point: THREE.Vector3;
}

/**
 * Undoable move of object origins that leaves their geometry, children and face
 * textures in place.
 */
export class CommandObjectPivotSet implements UndoCommand {
  private readonly targets: ObjectPivotTarget[];
  private snapshots: ObjectPivotSnapshot[];

  /** @param targets Objects and the world points their origins go to. */
  constructor(targets: readonly ObjectPivotTarget[]) {
    this.targets = targets.map((target) => ({ object: target.object, point: target.point.clone() }));
    this.snapshots = [];
  }

  /** Moves every origin. */
  execute(): void {
    this.snapshots = this.targets.map((target) => objectPivotMove(target.object, target.point));
  }

  /** Puts every origin back. */
  undo(): void {
    for (let index = this.snapshots.length - 1; index >= 0; index--) objectPivotRestore(this.snapshots[index]!);
    this.snapshots = [];
  }

  /**
   * Returns the objects whose origin moved.
   *
   * @returns Objects.
   */
  objects(): THREE.Object3D[] {
    return this.targets.map((target) => target.object);
  }
}
