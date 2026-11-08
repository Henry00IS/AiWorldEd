import * as THREE from 'three';
import { UndoCommand } from '@/commands/command_undo.js';
import { restoreObjectAtIndex } from '@/utils/utils_hierarchy.js';

/** Undoable command that replaces one source mesh with two split results. */
export class CommandMeshSplit implements UndoCommand {
  private sourceMesh: THREE.Mesh;
  private frontMesh: THREE.Mesh;
  private backMesh: THREE.Mesh;
  private worldGroup: THREE.Group;
  private parent: THREE.Object3D | null;
  private siblingIndex: number;
  private executed: boolean;

  /**
   * Creates a split mesh command.
   *
   * @param sourceMesh The mesh being replaced.
   * @param frontMesh The front half result.
   * @param backMesh The back half result.
   * @param worldGroup Fallback parent when the source has none.
   */
  constructor(sourceMesh: THREE.Mesh, frontMesh: THREE.Mesh, backMesh: THREE.Mesh, worldGroup: THREE.Group) {
    this.sourceMesh = sourceMesh;
    this.frontMesh = frontMesh;
    this.backMesh = backMesh;
    this.worldGroup = worldGroup;
    this.parent = sourceMesh.parent;
    this.siblingIndex = sourceMesh.parent ? sourceMesh.parent.children.indexOf(sourceMesh) : 0;
    this.executed = false;
  }

  /** Removes the source mesh and inserts both split pieces. */
  execute(): void {
    if (this.executed) return;
    this.parent = this.sourceMesh.parent;
    this.siblingIndex = this.parent ? this.parent.children.indexOf(this.sourceMesh) : 0;
    this.parent?.remove(this.sourceMesh);
    restoreObjectAtIndex(this.frontMesh, this.parent, this.siblingIndex, this.worldGroup);
    restoreObjectAtIndex(this.backMesh, this.parent, this.siblingIndex + 1, this.worldGroup);
    this.executed = true;
  }

  /** Removes both results and restores the source mesh. */
  undo(): void {
    if (!this.executed) return;
    this.frontMesh.parent?.remove(this.frontMesh);
    this.backMesh.parent?.remove(this.backMesh);
    restoreObjectAtIndex(this.sourceMesh, this.parent, this.siblingIndex, this.worldGroup);
    this.executed = false;
  }

  /**
   * Returns both result meshes.
   *
   * @returns Front and back meshes.
   */
  getResultMeshes(): THREE.Mesh[] {
    return [this.frontMesh, this.backMesh];
  }
}
