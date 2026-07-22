import * as THREE from 'three';
import { UndoCommand } from './undo_command.js';

/**
 * Snapshot capturing the state of a group and its children before ungrouping.
 * Stores all information needed to restore the group structure on undo.
 */
export interface UngroupChildSnapshot {
  /** The child object that was in the group. */
  child: THREE.Object3D;

  /** The sibling index of the child within the group. */
  siblingIndex: number;
}

/**
 * Undoable command for ungrouping a group object.
 * Execute reparents children to the group's parent; undo restores the group.
 */
export class UngroupCommand implements UndoCommand {
  private group: THREE.Group;
  private originalParent: THREE.Object3D | null;
  private groupSiblingIndex: number;
  private childSnapshots: UngroupChildSnapshot[];
  private executed: boolean;

  /**
   * Creates a new ungroup command for the specified group.
   * @param group The group object to ungroup.
   */
  constructor(group: THREE.Group) {
    this.group = group;
    this.originalParent = group.parent;
    this.groupSiblingIndex = this.originalParent
      ? this.originalParent.children.indexOf(group)
      : 0;
    this.childSnapshots = this.buildSnapshots(group);
    this.executed = false;
  }

  /**
   * Executes the ungroup by moving children to the group's original parent.
   */
  execute(): void {
    if (this.executed) return;
    const childrenToRemove: THREE.Object3D[] = [];
    this.group.children.forEach((child) => {
      childrenToRemove.push(child);
    });
    childrenToRemove.forEach((child) => {
      this.group.remove(child);
      if (this.originalParent) {
        this.originalParent.add(child);
      }
    });
    if (this.group.parent) {
      this.group.parent.remove(this.group);
    }
    this.executed = true;
  }

  /**
   * Undoes the ungroup by restoring children to the group and re-adding it.
   */
  undo(): void {
    this.childSnapshots.forEach((snapshot) => {
      if (snapshot.child.parent) {
        snapshot.child.parent.remove(snapshot.child);
      }
      this.group.add(snapshot.child);
    });
    if (this.originalParent) {
      if (this.groupSiblingIndex < this.originalParent.children.length) {
        this.originalParent.children.splice(
          this.groupSiblingIndex, 0, this.group
        );
      } else {
        this.originalParent.add(this.group);
      }
    }
    this.executed = false;
  }

  /**
   * Returns the group object associated with this command.
   * @returns The Three.js Group being ungrouped.
   */
  getGroup(): THREE.Group {
    return this.group;
  }

  /**
   * Builds snapshots for each child of the group.
   * @param group The group whose children should be snapshotted.
   * @returns An array of child state snapshots.
   */
  private buildSnapshots(group: THREE.Group): UngroupChildSnapshot[] {
    const snapshots: UngroupChildSnapshot[] = [];
    group.children.forEach((child, index) => {
      const snapshot: UngroupChildSnapshot = {
        child: child,
        siblingIndex: index
      };
      snapshots.push(snapshot);
    });
    return snapshots;
  }
}
