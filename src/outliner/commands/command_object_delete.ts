import * as THREE from 'three';
import { UndoCommand } from '@/commands/command_undo.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import { modifierBevelRefreshScene } from '@/modifier/compile/modifier_bevel_scene_refresh.js';

/**
 * Complete state snapshot of a mesh captured before deletion. Contains all
 * information needed to fully restore the mesh.
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
 * Undoable command for deleting objects. Execute removes meshes from their
 * parents; undo restores them.
 */
export class CommandObjectDelete implements UndoCommand {
  private snapshots: DeleteSnapshot[];
  private executed: boolean;

  /**
   * Creates a new delete object command.
   *
   * @param snapshots The state snapshots of all objects to delete.
   */
  constructor(snapshots: DeleteSnapshot[]) {
    this.snapshots = snapshots;
    this.executed = false;
  }

  /** Executes the deletion by removing all meshes from their parents. */
  execute(): void {
    if (this.executed) return;
    this.snapshots.forEach((snapshot) => {
      if (snapshot.mesh.parent) {
        snapshot.mesh.parent.remove(snapshot.mesh);
      }
    });
    this.executed = true;
    this.refreshBevelVolumes();
  }

  /** Undoes the deletion by restoring all meshes to their original state. */
  undo(): void {
    if (!this.executed) return;
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
        snapshot.mesh.parent = snapshot.parent;
      } else {
        snapshot.parent.add(snapshot.mesh);
      }
    });
    this.executed = false;
    this.refreshBevelVolumes();
  }

  /** Rebuilds solids when a deleted object is a bevel volume. */
  private refreshBevelVolumes(): void {
    const snapshot = this.snapshots.find((entry) => ModifierVolumeBevel.isVolume(entry.mesh));
    if (!snapshot?.parent) return;
    modifierBevelRefreshScene(rootOf(snapshot.parent));
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
