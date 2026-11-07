import type * as THREE from 'three';
import type { UndoCommand } from '@/commands/command_undo.js';
import { modifierBevelRefreshScene } from '@/modifier/compile/modifier_bevel_scene_refresh.js';
import { modifierVolumeSceneRoot } from './modifier_volume.js';

/**
 * Undoable creation of a modifier volume. Execute parents the mesh; undo
 * detaches it.
 */
export class CommandModifierVolumeCreate implements UndoCommand {
  private readonly mesh: THREE.Mesh;
  private readonly parent: THREE.Object3D;

  /**
   * Creates the command.
   *
   * @param mesh Modifier volume mesh.
   * @param parent Parent that receives the mesh.
   */
  constructor(mesh: THREE.Mesh, parent: THREE.Object3D) {
    this.mesh = mesh;
    this.parent = parent;
  }

  /** Adds the volume and refreshes overlapping solids. */
  execute(): void {
    if (!this.mesh.parent) this.parent.add(this.mesh);
    modifierBevelRefreshScene(modifierVolumeSceneRoot(this.parent));
  }

  /** Removes the volume and restores overlapping solids. */
  undo(): void {
    this.mesh.parent?.remove(this.mesh);
    modifierBevelRefreshScene(modifierVolumeSceneRoot(this.parent));
  }
}
