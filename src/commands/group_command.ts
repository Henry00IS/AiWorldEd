import * as THREE from 'three';
import { UndoCommand } from './undo_command.js';

/**
 * Snapshot capturing the state of each child before grouping.
 * Stores parent reference and sibling index for undo restoration.
 */
export interface GroupChildSnapshot {
  /** The child object being grouped. */
  child: THREE.Object3D;

  /** The original parent of the child before grouping. */
  originalParent: THREE.Object3D | null;

  /** The sibling index of the child within its original parent. */
  siblingIndex: number;
}

/**
 * Undoable command for grouping selected objects under a new parent group.
 * Execute creates the group and reparents children; undo restores original parents.
 */
export class GroupCommand implements UndoCommand {
  private group: THREE.Group;
  private newParent: THREE.Object3D;
  private childSnapshots: GroupChildSnapshot[];
  private groupName: string;
  private executed: boolean;

  /**
   * Creates a new group command for selected objects.
   * @param objects The objects to group together.
   * @param parent The parent object to add the new group under.
   * @param groupName The name for the new group container.
   */
  constructor(
    objects: THREE.Object3D[],
    parent: THREE.Object3D,
    groupName: string
  ) {
    this.group = new THREE.Group();
    this.group.name = groupName;
    this.newParent = parent;
    this.childSnapshots = this.buildSnapshots(objects);
    this.groupName = groupName;
    this.executed = false;
  }

  /**
   * Executes the group by adding children to the group and placing it under the parent.
   */
  execute(): void {
    if (this.executed) return;
    this.childSnapshots.forEach((snapshot) => {
      snapshot.child.parent?.remove(snapshot.child);
      this.group.add(snapshot.child);
    });
    this.newParent.add(this.group);
    this.executed = true;
  }

  /**
   * Undoes the group by reparenting children to their original parents.
   */
  undo(): void {
    this.childSnapshots.forEach((snapshot) => {
      if (snapshot.child.parent) {
        snapshot.child.parent.remove(snapshot.child);
      }
      if (snapshot.originalParent) {
        snapshot.originalParent.add(snapshot.child);
        const currentIndex = snapshot.originalParent.children.indexOf(snapshot.child);
        if (currentIndex > snapshot.siblingIndex) {
          snapshot.originalParent.children.splice(currentIndex, 1);
          snapshot.originalParent.children.splice(
            snapshot.siblingIndex, 0, snapshot.child
          );
          snapshot.child.parent = snapshot.originalParent;
        }
      }
    });
    if (this.group.parent) {
      this.group.parent.remove(this.group);
    }
    this.executed = false;
  }

  /**
   * Returns the group object created by this command.
   * @returns The Three.js Group containing the grouped children.
   */
  getGroup(): THREE.Group {
    return this.group;
  }

  /**
   * Builds snapshots capturing each child's original parent and position.
   * @param objects The objects to snapshot.
   * @returns An array of child state snapshots.
   */
  private buildSnapshots(objects: THREE.Object3D[]): GroupChildSnapshot[] {
    const snapshots: GroupChildSnapshot[] = [];
    objects.forEach((child) => {
      const snapshot: GroupChildSnapshot = {
        child: child,
        originalParent: child.parent,
        siblingIndex: child.parent ? child.parent.children.indexOf(child) : 0
      };
      snapshots.push(snapshot);
    });
    return snapshots;
  }
}
