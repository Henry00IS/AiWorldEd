import * as THREE from 'three';
import { UndoCommand } from '@/commands/command_undo.js';
import { restoreObjectAtIndex } from '@/utils/utils_hierarchy.js';

/** Undoable command that replaces one source mesh with a single clip result. */
export class CommandMeshClip implements UndoCommand {
  private sourceMesh: THREE.Mesh;
  private resultMesh: THREE.Mesh;
  private worldGroup: THREE.Group;
  private parent: THREE.Object3D | null;
  private siblingIndex: number;
  private executed: boolean;

  /**
   * Creates a clip mesh command.
   *
   * @param sourceMesh The mesh being replaced.
   * @param resultMesh The capped clip result.
   * @param worldGroup Fallback parent when the source has none.
   */
  constructor(sourceMesh: THREE.Mesh, resultMesh: THREE.Mesh, worldGroup: THREE.Group) {
    this.sourceMesh = sourceMesh;
    this.resultMesh = resultMesh;
    this.worldGroup = worldGroup;
    this.parent = sourceMesh.parent;
    this.siblingIndex = sourceMesh.parent ? sourceMesh.parent.children.indexOf(sourceMesh) : 0;
    this.executed = false;
  }

  /** Removes the source mesh and inserts the clip result. */
  execute(): void {
    if (this.executed) return;
    this.parent = this.sourceMesh.parent;
    this.siblingIndex = this.parent ? this.parent.children.indexOf(this.sourceMesh) : 0;
    this.parent?.remove(this.sourceMesh);
    restoreObjectAtIndex(this.resultMesh, this.parent, this.siblingIndex, this.worldGroup);
    this.executed = true;
  }

  /** Removes the result and restores the source mesh. */
  undo(): void {
    if (!this.executed) return;
    this.resultMesh.parent?.remove(this.resultMesh);
    restoreObjectAtIndex(this.sourceMesh, this.parent, this.siblingIndex, this.worldGroup);
    this.executed = false;
  }

  /**
   * Returns the clip result mesh.
   *
   * @returns The result mesh.
   */
  getResultMesh(): THREE.Mesh {
    return this.resultMesh;
  }
}
