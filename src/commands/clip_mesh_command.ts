import * as THREE from 'three';
import { UndoCommand } from './undo_command.js';

/**
 * Undoable command that replaces one source mesh with a single clip result.
 */
export class ClipMeshCommand implements UndoCommand {
  private sourceMesh: THREE.Mesh;
  private resultMesh: THREE.Mesh;
  private worldGroup: THREE.Group;
  private parent: THREE.Object3D | null;
  private siblingIndex: number;
  private executed: boolean;

  /**
   * Creates a clip mesh command.
   * @param sourceMesh The mesh being replaced.
   * @param resultMesh The capped clip result.
   * @param worldGroup Fallback parent when the source has none.
   */
  constructor(
    sourceMesh: THREE.Mesh,
    resultMesh: THREE.Mesh,
    worldGroup: THREE.Group
  ) {
    this.sourceMesh = sourceMesh;
    this.resultMesh = resultMesh;
    this.worldGroup = worldGroup;
    this.parent = sourceMesh.parent;
    this.siblingIndex = sourceMesh.parent
      ? sourceMesh.parent.children.indexOf(sourceMesh)
      : 0;
    this.executed = false;
  }

  /**
   * Removes the source mesh and inserts the clip result.
   */
  execute(): void {
    if (this.executed) return;
    this.parent?.remove(this.sourceMesh);
    const insertParent = this.parent ?? this.worldGroup;
    insertParent.add(this.resultMesh);
    this.executed = true;
  }

  /**
   * Removes the result and restores the source mesh.
   */
  undo(): void {
    if (!this.executed) return;
    this.resultMesh.parent?.remove(this.resultMesh);
    this.restoreMesh(this.sourceMesh, this.parent, this.siblingIndex);
    this.executed = false;
  }

  /**
   * Returns the clip result mesh.
   * @returns The result mesh.
   */
  getResultMesh(): THREE.Mesh {
    return this.resultMesh;
  }

  /**
   * Restores a mesh under its original parent at the original sibling index.
   * @param mesh The mesh to restore.
   * @param parent The original parent.
   * @param index The original sibling index.
   */
  private restoreMesh(
    mesh: THREE.Mesh,
    parent: THREE.Object3D | null,
    index: number
  ): void {
    const targetParent = parent ?? this.worldGroup;
    targetParent.add(mesh);
    const currentIndex = targetParent.children.indexOf(mesh);
    if (currentIndex !== index && currentIndex >= 0) {
      targetParent.children.splice(currentIndex, 1);
      targetParent.children.splice(index, 0, mesh);
      mesh.parent = targetParent;
    }
  }
}
