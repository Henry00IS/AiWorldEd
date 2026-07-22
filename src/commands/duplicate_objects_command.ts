import * as THREE from 'three';
import { UndoCommand } from './undo_command.js';
import { ObjectDuplicator } from '../managers/object_duplicator.js';

/**
 * Undoable command for duplicating objects.
 * Execute runs the duplicator and adds clones to parent.
 * Undo removes clones and disposes their resources.
 */
export class DuplicateObjectsCommand implements UndoCommand {
  private sourceMeshes: THREE.Mesh[];
  private parent: THREE.Object3D;
  private offset: THREE.Vector3;
  private clonedMeshes: THREE.Mesh[];
  private executed: boolean;

  /**
   * Creates a new duplicate objects command.
   * @param sourceMeshes The meshes to duplicate.
   * @param parent The parent object to add clones to.
   * @param offset The positional offset for each clone.
   */
  constructor(
    sourceMeshes: THREE.Mesh[],
    parent: THREE.Object3D,
    offset: THREE.Vector3
  ) {
    this.sourceMeshes = sourceMeshes;
    this.parent = parent;
    this.offset = offset.clone();
    this.clonedMeshes = [];
    this.executed = false;
  }

  /**
   * Executes the duplication and adds clones to the parent.
   */
  execute(): void {
    if (this.executed) return;
    this.clonedMeshes = ObjectDuplicator.duplicate(this.sourceMeshes, this.offset);
    this.clonedMeshes.forEach((clone) => {
      this.parent.add(clone);
    });
    this.executed = true;
  }

  /**
   * Undoes the duplication by removing clones and disposing resources.
   */
  undo(): void {
    this.clonedMeshes.forEach((clone) => {
      if (clone.parent) {
        clone.parent.remove(clone);
      }
      this.disposeMeshResources(clone);
    });
    this.clonedMeshes = [];
    this.executed = false;
  }

  /**
   * Disposes the geometry and material of a mesh and its children.
   * @param mesh The mesh whose resources should be disposed.
   */
  private disposeMeshResources(mesh: THREE.Mesh): void {
    mesh.children.forEach((child) => {
      this.disposeChildResource(child);
    });
    mesh.geometry.dispose();
    if (mesh.material) {
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((mat) => mat.dispose());
      } else {
        (mesh.material as THREE.Material).dispose();
      }
    }
  }

  /**
   * Disposes resources of a child object such as LineSegments.
   * @param child The child object to dispose resources for.
   */
  private disposeChildResource(child: THREE.Object3D): void {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((mat) => mat.dispose());
        } else {
          (child.material as THREE.Material).dispose();
        }
      }
    }
    if (child instanceof THREE.LineSegments) {
      child.geometry.dispose();
      if (child.material) {
        (child.material as THREE.Material).dispose();
      }
    }
  }

  /**
   * Returns the list of cloned meshes created during execution.
   * @returns The array of cloned mesh references.
   */
  getClonedMeshes(): THREE.Mesh[] {
    return this.clonedMeshes;
  }
}
