import * as THREE from 'three';
import { UndoCommand } from './undo_command.js';

/**
 * Undoable command for creating a primitive mesh.
 * Execute adds the mesh to its parent; undo removes it without disposing.
 * Resources are preserved so that redo can re-add the mesh.
 */
export class CreatePrimitiveCommand implements UndoCommand {
  private mesh: THREE.Mesh;
  private parent: THREE.Object3D;

  /**
    * Creates a new create primitive command.
    * @param mesh The mesh to be added to the parent.
    * @param parent The parent object to which the mesh will be added.
    */
  constructor(mesh: THREE.Mesh, parent: THREE.Object3D) {
    this.mesh = mesh;
    this.parent = parent;
  }

  /**
    * Executes the command by adding the mesh to the parent.
    * No-op if the mesh is already a child of the parent.
    */
  execute(): void {
    if (this.mesh.parent) return;
    this.parent.add(this.mesh);
  }

  /**
    * Undoes the command by removing the mesh from its parent.
    * Does not dispose geometry or material so redo remains possible.
    */
  undo(): void {
    if (this.mesh.parent) {
      this.mesh.parent.remove(this.mesh);
    }
  }
}
