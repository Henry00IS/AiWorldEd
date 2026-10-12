import type * as THREE from 'three';
import type { UndoCommand } from '@/commands/command_undo.js';
import { modifierBevelRefreshScene } from '@/modifier/compile/modifier_bevel_scene_refresh.js';

/**
 * Undoable creation of a bevel volume. Execute parents the mesh; undo detaches
 * it.
 */
export class CommandModifierBevelVolumeCreate implements UndoCommand {
  private readonly mesh: THREE.Mesh;
  private readonly parent: THREE.Object3D;

  /**
   * Creates the command.
   *
   * @param mesh Bevel volume mesh.
   * @param parent Parent that receives the mesh.
   */
  constructor(mesh: THREE.Mesh, parent: THREE.Object3D) {
    this.mesh = mesh;
    this.parent = parent;
  }

  /** Adds the volume and refreshes overlapping solids. */
  execute(): void {
    if (!this.mesh.parent) this.parent.add(this.mesh);
    modifierBevelRefreshScene(sceneRootOf(this.parent));
  }

  /** Removes the volume and restores overlapping solids. */
  undo(): void {
    this.mesh.parent?.remove(this.mesh);
    modifierBevelRefreshScene(sceneRootOf(this.parent));
  }
}

/**
 * Walks to the top of the parent chain.
 *
 * @param object Start object.
 * @returns Root object.
 */
function sceneRootOf(object: THREE.Object3D): THREE.Object3D {
  let current = object;
  while (current.parent) current = current.parent;
  return current;
}
