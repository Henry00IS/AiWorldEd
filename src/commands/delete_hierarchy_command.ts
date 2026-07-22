import * as THREE from 'three';
import { UndoCommand } from './undo_command.js';

/**
 * Snapshot of a hierarchy node removed from the scene.
 */
export interface HierarchyDeleteSnapshot {
  object: THREE.Object3D;
  parent: THREE.Object3D | null;
  siblingIndex: number;
}

/**
 * Undoable command that removes hierarchy nodes (meshes, groups, empty groups).
 * Removes whole subtrees; undo reinserts them at their original indices.
 */
export class DeleteHierarchyCommand implements UndoCommand {
  private snapshots: HierarchyDeleteSnapshot[];
  private executed: boolean;

  /**
   * Creates a hierarchy delete command.
   * @param objects Root objects to remove (already collapsed to hierarchy roots).
   */
  constructor(objects: THREE.Object3D[]) {
    this.snapshots = objects.map((object) => ({
      object,
      parent: object.parent,
      siblingIndex: object.parent
        ? object.parent.children.indexOf(object)
        : 0
    }));
    this.executed = false;
  }

  /**
   * Removes each object from its parent.
   */
  execute(): void {
    if (this.executed) return;
    this.snapshots.forEach((snapshot) => {
      if (snapshot.parent) {
        snapshot.parent.remove(snapshot.object);
      }
    });
    this.executed = true;
  }

  /**
   * Restores each object to its original parent and sibling index.
   */
  undo(): void {
    if (!this.executed) return;
    this.snapshots.forEach((snapshot) => {
      if (!snapshot.parent) return;
      if (snapshot.siblingIndex < snapshot.parent.children.length) {
        snapshot.parent.children.splice(
          snapshot.siblingIndex,
          0,
          snapshot.object
        );
        snapshot.object.parent = snapshot.parent;
      } else {
        snapshot.parent.add(snapshot.object);
      }
    });
    this.executed = false;
  }
}
