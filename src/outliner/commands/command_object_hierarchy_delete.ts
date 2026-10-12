import * as THREE from 'three';
import { UndoCommand } from '@/commands/command_undo.js';
import { modifierBevelRefreshScene } from '@/modifier/compile/modifier_bevel_scene_refresh.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';

/** Snapshot of a hierarchy node removed from the scene. */
export interface HierarchyDeleteSnapshot {
  object: THREE.Object3D;
  parent: THREE.Object3D | null;
  siblingIndex: number;
}

/**
 * Undoable command that removes hierarchy nodes (meshes, groups, empty groups).
 * Removes whole subtrees; undo reinserts them at their original indices.
 */
export class CommandObjectHierarchyDelete implements UndoCommand {
  private snapshots: HierarchyDeleteSnapshot[];
  private executed: boolean;

  /**
   * Creates a hierarchy delete command.
   *
   * @param objects Root objects to remove (already collapsed to hierarchy
   *   roots).
   */
  constructor(objects: THREE.Object3D[]) {
    this.snapshots = objects.map((object) => ({
      object,
      parent: object.parent,
      siblingIndex: object.parent ? object.parent.children.indexOf(object) : 0,
    }));
    this.executed = false;
  }

  /** Removes each object from its parent. */
  execute(): void {
    if (this.executed) return;
    this.snapshots.forEach((snapshot) => {
      if (snapshot.parent) {
        snapshot.parent.remove(snapshot.object);
      }
    });
    this.executed = true;
    this.refreshBevelVolumes();
  }

  /** Restores each object to its original parent and sibling index. */
  undo(): void {
    if (!this.executed) return;
    this.snapshots.forEach((snapshot) => {
      if (!snapshot.parent) return;
      if (snapshot.siblingIndex < snapshot.parent.children.length) {
        snapshot.parent.children.splice(snapshot.siblingIndex, 0, snapshot.object);
        snapshot.object.parent = snapshot.parent;
      } else {
        snapshot.parent.add(snapshot.object);
      }
    });
    this.executed = false;
    this.refreshBevelVolumes();
  }

  /** Rebuilds solids when a removed node is or contains a bevel volume. */
  private refreshBevelVolumes(): void {
    const snapshot = this.snapshots.find((entry) => entry.parent && subtreeHasBevelVolume(entry.object));
    if (!snapshot?.parent) return;
    modifierBevelRefreshScene(rootOf(snapshot.parent));
  }
}

/**
 * Returns whether a node or one of its descendants is a bevel volume.
 *
 * @param object Hierarchy node.
 * @returns True when a bevel volume is in the subtree.
 */
function subtreeHasBevelVolume(object: THREE.Object3D): boolean {
  if (ModifierVolumeBevel.isVolume(object)) return true;
  return object.children.some((child) => subtreeHasBevelVolume(child));
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
