import * as THREE from 'three';
import { UndoCommand } from '@/commands/command_undo.js';
import { ObjectDuplicator } from '@/outliner/hierarchy/object_duplicator.js';
import { sortObjectsBySceneOrder } from '@/utils/utils_hierarchy.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { findSolidModelRoot } from '@/solid/model/solid_group.js';
import { modifierBevelRefreshScene } from '@/modifier/compile/modifier_bevel_scene_refresh.js';

/**
 * Undoable command for duplicating objects. Execute runs the duplicator and
 * adds clones to parent; generator clones stay right after their source. Undo
 * removes clones and disposes their resources. Sources are cloned in outliner /
 * scene-graph order, not selection order.
 */
export class CommandObjectDuplicate implements UndoCommand {
  private sourceMeshes: THREE.Mesh[];
  private parent: THREE.Object3D;
  private offset: THREE.Vector3;
  private clonedMeshes: THREE.Mesh[];
  private executed: boolean;

  /**
   * Creates a new duplicate objects command.
   *
   * @param sourceMeshes The meshes to duplicate.
   * @param parent The parent object to add clones to.
   * @param offset The positional offset for each clone.
   */
  constructor(sourceMeshes: THREE.Mesh[], parent: THREE.Object3D, offset: THREE.Vector3) {
    this.sourceMeshes = sortObjectsBySceneOrder(sourceMeshes);
    this.parent = parent;
    this.offset = offset.clone();
    this.clonedMeshes = [];
    this.executed = false;
  }

  /** Executes the duplication and adds clones to the parent. */
  execute(): void {
    if (this.executed) return;
    this.clonedMeshes = ObjectDuplicator.duplicate(this.sourceMeshes, this.offset);
    this.clonedMeshes.forEach((clone, index) => {
      this.place(this.sourceMeshes[index]!, clone);
    });
    this.executed = true;
    this.refreshBevelVolumes();
  }

  /**
   * Adds a clone under the parent. A generator only lives inside a solid model,
   * so its clone stays next to its source, as solid brush clones do; so does
   * the clone of a volume inside a solid model, which then affects the same
   * earlier nodes there.
   *
   * @param source Source mesh.
   * @param clone Its clone.
   */
  private place(source: THREE.Mesh, clone: THREE.Mesh): void {
    const home = source.parent;
    const staysHome =
      ModifierVolume.isGenerator(source) || (ModifierVolume.isVolume(source) && findSolidModelRoot(source));
    if (!staysHome || !home) {
      this.parent.add(clone);
      return;
    }
    home.add(clone);
    home.children.splice(home.children.indexOf(clone), 1);
    home.children.splice(home.children.indexOf(source) + 1, 0, clone);
  }

  /** Undoes the duplication by removing clones and disposing resources. */
  undo(): void {
    if (!this.executed) return;
    this.clonedMeshes.forEach((clone) => {
      if (clone.parent) {
        clone.parent.remove(clone);
      }
      this.disposeMeshResources(clone);
    });
    this.clonedMeshes = [];
    this.executed = false;
    this.refreshBevelVolumes();
  }

  /** Rebuilds solids when a duplicated object is a bevel volume. */
  private refreshBevelVolumes(): void {
    const volumes = this.sourceMeshes.some((mesh) => ModifierVolume.isVolume(mesh));
    if (!volumes) return;
    modifierBevelRefreshScene(rootOf(this.parent));
  }

  /**
   * Disposes the geometry and material of a mesh and its children.
   *
   * @param mesh The mesh whose resources should be disposed.
   */
  private disposeMeshResources(mesh: THREE.Mesh): void {
    mesh.children.forEach((child) => {
      this.disposeChildResource(child);
    });
    mesh.geometry?.dispose();
    this.disposeMaterial(mesh.material);
  }

  /**
   * Disposes resources of a child object such as LineSegments.
   *
   * @param child The child object to dispose resources for.
   */
  private disposeChildResource(child: THREE.Object3D): void {
    if (child instanceof THREE.Mesh) {
      child.geometry?.dispose();
      this.disposeMaterial(child.material);
    }
    if (child instanceof THREE.LineSegments) {
      child.geometry?.dispose();
      this.disposeMaterial(child.material);
    }
  }

  /**
   * Disposes a material or material array when present.
   *
   * @param material Material, material array, or undefined.
   */
  private disposeMaterial(material: THREE.Material | THREE.Material[] | undefined): void {
    if (!material) return;
    if (Array.isArray(material)) {
      material.forEach((entry) => entry.dispose());
      return;
    }
    material.dispose();
  }

  /**
   * Returns a copy of the cloned meshes created during execution.
   *
   * @returns The array of cloned mesh references.
   */
  getClonedMeshes(): THREE.Mesh[] {
    return this.clonedMeshes.slice();
  }
}

/**
 * Walks to the top of a parent chain.
 *
 * @param object Start object.
 * @returns Root object.
 */
function rootOf(object: THREE.Object3D): THREE.Object3D {
  let current = object;
  while (current.parent) current = current.parent;
  return current;
}
