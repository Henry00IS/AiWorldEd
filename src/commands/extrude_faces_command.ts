import * as THREE from 'three';
import { UndoCommand } from './undo_command.js';

/**
 * Undoable command that creates one or more convex prism objects from face extrudes.
 * Source meshes are never modified — each extrude spawns a new solid.
 */
export class ExtrudeFacesCommand implements UndoCommand {
  private createdMeshes: THREE.Mesh[];
  private parent: THREE.Object3D;
  private isDisposed: boolean;

  /**
   * Creates a command that parents newly built extrusion meshes.
   * @param createdMeshes The convex prism meshes produced by the extrude.
   * @param parent The scene root or group that will own the new meshes.
   */
  constructor(createdMeshes: THREE.Mesh[], parent: THREE.Object3D) {
    this.createdMeshes = createdMeshes.slice();
    this.parent = parent;
    this.isDisposed = false;
  }

  /**
   * Adds every extruded mesh to the parent if not already present.
   */
  execute(): void {
    if (this.isDisposed) return;
    this.createdMeshes.forEach((mesh) => {
      if (mesh.parent === this.parent) return;
      this.parent.add(mesh);
    });
  }

  /**
   * Removes every extruded mesh from the scene without disposing resources.
   */
  undo(): void {
    if (this.isDisposed) return;
    this.createdMeshes.forEach((mesh) => {
      if (mesh.parent) {
        mesh.parent.remove(mesh);
      }
    });
  }

  /**
   * Returns all meshes created by this extrude.
   * @returns The new convex prism meshes.
   */
  getCreatedMeshes(): THREE.Mesh[] {
    return this.createdMeshes.slice();
  }

  /**
   * Returns the first created mesh, if any (compatibility helper).
   * @returns The first mesh, or null.
   */
  getCreatedMesh(): THREE.Mesh | null {
    return this.createdMeshes.length > 0 ? this.createdMeshes[0] : null;
  }

  /**
   * Disposes geometry and materials of all created meshes when permanently dropped.
   */
  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.createdMeshes.forEach((mesh) => this.disposeMesh(mesh));
    this.createdMeshes = [];
  }

  /**
   * Removes and disposes a single created mesh.
   * @param mesh The mesh to dispose.
   */
  private disposeMesh(mesh: THREE.Mesh): void {
    if (mesh.parent) {
      mesh.parent.remove(mesh);
    }
    mesh.geometry?.dispose();
    this.disposeMaterial(mesh.material);
    mesh.children.slice().forEach((child) => {
      mesh.remove(child);
      if (child instanceof THREE.LineSegments) {
        child.geometry?.dispose();
        this.disposeMaterial(child.material);
      }
    });
  }

  /**
   * Disposes a material or material array.
   * @param material Material(s) to dispose.
   */
  private disposeMaterial(
    material: THREE.Material | THREE.Material[]
  ): void {
    if (Array.isArray(material)) {
      material.forEach((entry) => entry.dispose());
      return;
    }
    material?.dispose();
  }
}
