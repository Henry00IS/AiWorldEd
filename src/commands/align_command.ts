import * as THREE from 'three';
import { UndoCommand } from './undo_command.js';

/**
 * Snapshot of a mesh's position before an alignment operation.
 * Used to restore the original position on undo.
 */
export interface ObjectAlignSnapshot {
  mesh: THREE.Mesh;
  originalPosition: THREE.Vector3;
}

/**
 * Undoable command for alignment operations.
 * Stores original positions and the target positions for each mesh.
 */
export class AlignCommand implements UndoCommand {
  private snapshots: ObjectAlignSnapshot[];
  private targetPositions: Map<THREE.Mesh, THREE.Vector3>;

  /**
   * Creates a new align command.
   * @param snapshots The position snapshots of all affected meshes.
   * @param targetPositions The target position for each mesh after alignment.
   */
  constructor(
    snapshots: ObjectAlignSnapshot[],
    targetPositions: Map<THREE.Mesh, THREE.Vector3>
  ) {
    this.snapshots = snapshots;
    this.targetPositions = targetPositions;
  }

  /**
   * Executes the alignment by moving each mesh to its target position.
   */
  execute(): void {
    this.snapshots.forEach((snapshot) => {
      const target = this.targetPositions.get(snapshot.mesh);
      if (target) {
        snapshot.mesh.position.copy(target);
      }
    });
  }

  /**
   * Undoes the alignment by restoring each mesh to its original position.
   */
  undo(): void {
    this.snapshots.forEach((snapshot) => {
      snapshot.mesh.position.copy(snapshot.originalPosition);
    });
  }
}
