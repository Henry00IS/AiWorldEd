import * as THREE from 'three';
import { UndoCommand } from './undo_command.js';

/**
 * Undoable command that creates a terrain mesh under the world root.
 */
export class CreateTerrainCommand implements UndoCommand {
  private mesh: THREE.Mesh;
  private worldGroup: THREE.Group;
  private executed: boolean;

  /**
   * Creates a terrain creation command.
   * @param mesh The terrain mesh to add.
   * @param worldGroup The world root group.
   */
  constructor(mesh: THREE.Mesh, worldGroup: THREE.Group) {
    this.mesh = mesh;
    this.worldGroup = worldGroup;
    this.executed = false;
  }

  /**
   * Adds the terrain mesh to the world group.
   */
  execute(): void {
    if (this.executed) return;
    this.worldGroup.add(this.mesh);
    this.executed = true;
  }

  /**
   * Removes the terrain mesh from the world group.
   */
  undo(): void {
    if (!this.executed) return;
    this.worldGroup.remove(this.mesh);
    this.executed = false;
  }

  /**
   * Returns the terrain mesh managed by this command.
   * @returns The terrain mesh.
   */
  getMesh(): THREE.Mesh {
    return this.mesh;
  }
}
