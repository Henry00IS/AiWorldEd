import type * as THREE from 'three';
import type { UndoCommand } from '@/commands/command_undo.js';
import { modifierBevelRefreshScene } from '@/modifier/compile/modifier_bevel_scene_refresh.js';
import { modifierVolumeSceneRoot } from './modifier_volume.js';
import { restoreObjectAtIndex } from '@/utils/utils_hierarchy.js';

/**
 * Undoable creation of a modifier volume. Execute parents the mesh; undo
 * detaches it.
 */
export class CommandModifierVolumeCreate implements UndoCommand {
  private readonly mesh: THREE.Mesh;
  private readonly parent: THREE.Object3D;
  private readonly siblingIndex: number;

  /**
   * Creates the command.
   *
   * @param mesh Modifier volume mesh.
   * @param parent Parent that receives the mesh.
   * @param after Child of the parent the mesh follows, or null to append.
   */
  constructor(mesh: THREE.Mesh, parent: THREE.Object3D, after: THREE.Object3D | null = null) {
    this.mesh = mesh;
    this.parent = parent;
    const afterIndex = after ? parent.children.indexOf(after) : -1;
    this.siblingIndex = afterIndex < 0 ? parent.children.length : afterIndex + 1;
  }

  /** Adds the volume at its sibling slot and refreshes overlapping solids. */
  execute(): void {
    if (!this.mesh.parent) restoreObjectAtIndex(this.mesh, this.parent, this.siblingIndex, this.parent);
    modifierBevelRefreshScene(modifierVolumeSceneRoot(this.parent));
  }

  /** Removes the volume and restores overlapping solids. */
  undo(): void {
    this.mesh.parent?.remove(this.mesh);
    modifierBevelRefreshScene(modifierVolumeSceneRoot(this.parent));
  }
}
