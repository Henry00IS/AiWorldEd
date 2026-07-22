import * as THREE from 'three';
import { UndoCommand } from './undo_command.js';

/**
 * Complete state snapshot of a mesh captured before deletion.
 * Contains all information needed to fully restore the mesh.
 */
export interface DeleteSnapshot {
  mesh: THREE.Mesh;
  parent: THREE.Object3D | null;
  siblingIndex: number;
  position: THREE.Vector3;
  rotation: THREE.Quaternion;
  scale: THREE.Vector3;
  name: string;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

/**
 * Undoable command for deleting objects.
 * Execute removes meshes from their parents; undo restores them.
 */
export class DeleteObjectCommand implements UndoCommand {
  private snapshots: DeleteSnapshot[];
  private executed: boolean;

  /**
   * Creates a new delete object command.
   * @param snapshots The state snapshots of all objects to delete.
   */
  constructor(snapshots: DeleteSnapshot[]) {
    this.snapshots = snapshots;
    this.executed = false;
  }

  /**
   * Executes the deletion by removing all meshes from their parents.
   */
  execute(): void {
    this.snapshots.forEach((snapshot) => {
      if (snapshot.mesh.parent) {
        snapshot.mesh.parent.remove(snapshot.mesh);
      }
    });
    this.executed = true;
  }

  /**
   * Undoes the deletion by restoring all meshes to their original state.
   */
  undo(): void {
    this.snapshots.forEach((snapshot) => {
      if (!snapshot.parent) return;
      snapshot.mesh.position.copy(snapshot.position);
      snapshot.mesh.quaternion.copy(snapshot.rotation);
      snapshot.mesh.scale.copy(snapshot.scale);
      snapshot.mesh.name = snapshot.name;
      snapshot.mesh.geometry = snapshot.geometry;
      snapshot.mesh.material = snapshot.material;
      if (snapshot.siblingIndex < snapshot.parent.children.length) {
        snapshot.parent.children.splice(snapshot.siblingIndex, 0, snapshot.mesh);
      } else {
        snapshot.parent.add(snapshot.mesh);
      }
    });
    this.executed = false;
  }
}
