import * as THREE from 'three';
import { UndoCommand } from './undo_command.js';

/**
 * Undoable command that replaces one source mesh with two split results.
 */
export class SplitMeshCommand implements UndoCommand {
  private sourceMesh: THREE.Mesh;
  private frontMesh: THREE.Mesh;
  private backMesh: THREE.Mesh;
  private worldGroup: THREE.Group;
  private parent: THREE.Object3D | null;
  private siblingIndex: number;
  private executed: boolean;

  /**
   * Creates a split mesh command.
   * @param sourceMesh The mesh being replaced.
   * @param frontMesh The front half result.
   * @param backMesh The back half result.
   * @param worldGroup Fallback parent when the source has none.
   */
  constructor(
    sourceMesh: THREE.Mesh,
    frontMesh: THREE.Mesh,
    backMesh: THREE.Mesh,
    worldGroup: THREE.Group
  ) {
    this.sourceMesh = sourceMesh;
    this.frontMesh = frontMesh;
    this.backMesh = backMesh;
    this.worldGroup = worldGroup;
    this.parent = sourceMesh.parent;
    this.siblingIndex = sourceMesh.parent
      ? sourceMesh.parent.children.indexOf(sourceMesh)
      : 0;
    this.executed = false;
  }

  /**
   * Removes the source mesh and inserts both split pieces.
   */
  execute(): void {
    if (this.executed) return;
    this.parent?.remove(this.sourceMesh);
    const insertParent = this.parent ?? this.worldGroup;
    insertParent.add(this.frontMesh);
    insertParent.add(this.backMesh);
    this.executed = true;
  }

  /**
   * Removes both results and restores the source mesh.
   */
  undo(): void {
    if (!this.executed) return;
    this.frontMesh.parent?.remove(this.frontMesh);
    this.backMesh.parent?.remove(this.backMesh);
    this.restoreMesh(this.sourceMesh, this.parent, this.siblingIndex);
    this.executed = false;
  }

  /**
   * Returns both result meshes.
   * @returns Front and back meshes.
   */
  getResultMeshes(): THREE.Mesh[] {
    return [this.frontMesh, this.backMesh];
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
