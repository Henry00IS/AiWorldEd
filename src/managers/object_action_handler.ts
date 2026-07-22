import * as THREE from 'three';
import { DeleteObjectCommand, DeleteSnapshot } from '../commands/delete_object_command.js';
import { DeleteHierarchyCommand } from '../commands/delete_hierarchy_command.js';
import { DuplicateObjectsCommand } from '../commands/duplicate_objects_command.js';
import { GroupCommand } from '../commands/group_command.js';
import { UngroupCommand } from '../commands/ungroup_command.js';
import { CommandStack } from '../commands/command_stack.js';
import { SelectionManager } from './selection_manager.js';
import {
  collapseToHierarchyRoots,
  findCommonParent
} from '../utils/hierarchy_selection.js';
import {
  filterUnlockedObjects,
  isObjectOrAncestorLocked
} from '../utils/object_lock.js';

/**
 * Callback invoked to sync scene state to all viewports.
 */
export type SyncViewportsCallback = () => void;

/**
 * Callback invoked to refresh the outliner panel.
 */
export type RefreshOutlinerCallback = () => void;

/**
 * Callback invoked to show a status message.
 * @param message The status message to display.
 */
export type StatusMessageCallback = (message: string) => void;

/**
 * Centralized handler for object-level actions: delete, duplicate, group, ungroup.
 * Coordinates command execution, viewport sync, outliner refresh, and feedback.
 */
export class ObjectActionHandler {
  private worldObject: THREE.Group;
  private commandStack: CommandStack;
  private selectionManager: SelectionManager;
  private syncViewports: SyncViewportsCallback | null;
  private refreshOutliner: RefreshOutlinerCallback | null;
  private showStatusMessage: StatusMessageCallback | null;
  private groupCounter: number;

  /**
   * Creates a new object action handler.
   * @param worldObject The root group containing scene objects.
   * @param commandStack The command stack for undo support.
   * @param selectionManager The selection manager.
   */
  constructor(
    worldObject: THREE.Group,
    commandStack: CommandStack,
    selectionManager: SelectionManager
  ) {
    this.worldObject = worldObject;
    this.commandStack = commandStack;
    this.selectionManager = selectionManager;
    this.syncViewports = null;
    this.refreshOutliner = null;
    this.showStatusMessage = null;
    this.groupCounter = 0;
  }

  /**
   * Sets the callback for synchronizing viewports after actions.
   * @param callback The synchronization function.
   */
  setSyncViewports(callback: SyncViewportsCallback): void {
    this.syncViewports = callback;
  }

  /**
   * Sets the callback for refreshing the outliner after actions.
   * @param callback The outliner refresh function.
   */
  setRefreshOutliner(callback: RefreshOutlinerCallback): void {
    this.refreshOutliner = callback;
  }

  /**
   * Sets the callback for showing status bar messages.
   * @param callback The status message function.
   */
  setShowStatusMessage(callback: StatusMessageCallback): void {
    this.showStatusMessage = callback;
  }

  /**
   * Handles deletion of selected meshes (viewport mesh selection).
   */
  onDeleteSelected(): void {
    const selected = this.selectionManager.getSelectedObjects();
    if (selected.size === 0) return;
    const toRemove = filterUnlockedObjects(Array.from(selected));
    if (toRemove.length === 0) {
      this.showMessage('Cannot delete locked object(s)');
      return;
    }
    const snapshots = this.buildDeleteSnapshots(toRemove);
    const command = new DeleteObjectCommand(snapshots);
    this.commandStack.push(command);
    this.selectionManager.clearSelection();
    this.notifySyncAndRefresh();
  }

  /**
   * Deletes hierarchy roots (meshes, groups, empty groups) from the scene.
   * @param objects Hierarchy nodes to remove.
   */
  deleteHierarchyObjects(objects: THREE.Object3D[]): void {
    const roots = filterUnlockedObjects(
      collapseToHierarchyRoots(objects).filter(
        (object) => object !== this.worldObject
      )
    );
    if (roots.length === 0) {
      this.showMessage('Cannot delete locked object(s)');
      return;
    }
    const command = new DeleteHierarchyCommand(roots);
    this.commandStack.push(command);
    this.selectionManager.clearSelection();
    this.notifySyncAndRefresh();
    this.showMessage(`Deleted ${roots.length} object(s)`);
  }

  /**
   * Handles duplication of selected objects.
   * Clones keep the same position as the source meshes.
   */
  onDuplicateSelected(): void {
    const selected = this.selectionManager.getSelectedObjects();
    if (selected.size === 0) return;
    const meshesToDuplicate = filterUnlockedObjects(Array.from(selected));
    if (meshesToDuplicate.length === 0) {
      this.showMessage('Cannot duplicate locked object(s)');
      return;
    }
    const command = new DuplicateObjectsCommand(
      meshesToDuplicate,
      this.worldObject,
      new THREE.Vector3(0, 0, 0)
    );
    this.commandStack.push(command);
    this.syncViewportsAndRefresh();
    this.selectAllClones(command);
    this.showDuplicateFeedback(meshesToDuplicate.length);
    this.notifyRefresh();
  }

  /**
    * Handles grouping of selected objects.
    */
  onGroupSelected(): void {
    const selected = this.selectionManager.getSelectedObjects();
    if (selected.size === 0) return;
    const objects = this.buildGroupObjectsFromSelection();
    if (objects.length === 0) {
      this.showMessage('Cannot group locked object(s)');
      return;
    }
    this.executeGroup(objects);
  }

  /**
    * Groups a specific set of objects together.
    * Used by the outliner context menu to group user-selected items.
    * @param objects The objects to group together.
    */
  groupObjects(objects: THREE.Object3D[]): void {
    const unlocked = filterUnlockedObjects(objects);
    if (unlocked.length === 0) {
      this.showMessage('Cannot group locked object(s)');
      return;
    }
    this.executeGroup(unlocked);
  }

  /**
    * Handles ungrouping of the selected object's parent group.
    */
  onUngroupSelected(): void {
    const firstSelected = this.selectionManager.getFirstSelectedObject();
    if (!firstSelected) return;
    const groupTarget = this.findGroupTarget(firstSelected);
    if (!groupTarget) return;
    this.ungroupGroup(groupTarget);
  }

  /**
    * Ungroups a specific group.
    * Used by the outliner context menu to ungroup a specific group.
    * @param group The group to ungroup.
    */
  ungroupGroup(group: THREE.Group): void {
    if (isObjectOrAncestorLocked(group)) {
      this.showMessage('Cannot ungroup locked group');
      return;
    }
    const command = new UngroupCommand(group);
    this.commandStack.push(command);
    this.notifySyncAndRefresh();
  }

  /**
   * Builds delete snapshots for all meshes to be deleted.
   * @param meshes The meshes that are about to be deleted.
   * @returns An array of delete snapshots capturing full state.
   */
  private buildDeleteSnapshots(meshes: THREE.Mesh[]): DeleteSnapshot[] {
    const snapshots: DeleteSnapshot[] = [];
    meshes.forEach((mesh) => {
      const snapshot: DeleteSnapshot = {
        mesh: mesh,
        parent: mesh.parent,
        siblingIndex: mesh.parent ? mesh.parent.children.indexOf(mesh) : 0,
        position: mesh.position.clone(),
        rotation: mesh.quaternion.clone(),
        scale: mesh.scale.clone(),
        name: mesh.name,
        geometry: mesh.geometry.clone(),
        material: (mesh.material as THREE.Material).clone()
      };
      snapshots.push(snapshot);
    });
    return snapshots;
  }

  /**
   * Builds the array of objects to group from the current selection.
   * Uses selected meshes as hierarchy nodes when no outliner override is supplied.
   * @returns An array of objects to include in the group.
   */
  private buildGroupObjectsFromSelection(): THREE.Object3D[] {
    return filterUnlockedObjects(
      this.selectionManager.getAllSelectedObjectsAsArray()
    );
  }

  /**
   * Executes the group command and triggers post-action notifications.
   * New group is parented under the common parent of the members so nesting
   * builds a tree instead of always dumping into the world root.
   * @param objects The objects to group together.
   */
  private executeGroup(objects: THREE.Object3D[]): void {
    const members = collapseToHierarchyRoots(objects);
    if (members.length === 0) return;
    this.groupCounter++;
    const groupName = this.buildGroupName();
    const parent = findCommonParent(members, this.worldObject);
    const command = new GroupCommand(members, parent, groupName);
    this.commandStack.push(command);
    this.notifySyncAndRefresh();
    this.showGroupFeedback(groupName);
  }

  /**
    * Finds the group target for ungrouping from a selected mesh.
   * @param mesh The selected mesh to find a group for.
   * @returns The group to ungroup, or null if none found.
   */
  private findGroupTarget(mesh: THREE.Mesh): THREE.Group | null {
    const parent = mesh.parent;
    if (parent instanceof THREE.Group && parent !== this.worldObject) {
      return parent;
    }
    return null;
  }

  /**
   * Selects every cloned mesh produced by a duplicate command.
   * @param command The duplicate command that produced the clones.
   */
  private selectAllClones(command: DuplicateObjectsCommand): void {
    const clonedMeshes = command.getClonedMeshes();
    if (clonedMeshes.length === 0) return;
    this.selectionManager.setSelection(clonedMeshes);
  }

  /**
   * Shows a feedback message in the status bar for duplication.
   * @param count The number of objects that were duplicated.
   */
  private showDuplicateFeedback(count: number): void {
    this.showMessage(`Duplicated ${count} object(s)`);
  }

  /**
   * Shows a feedback message in the status bar for grouping.
   * @param groupName The name of the newly created group.
   */
  private showGroupFeedback(groupName: string): void {
    this.showMessage(`Created group: ${groupName}`);
  }

  /**
   * Builds the next group name using the internal counter.
   * @returns A formatted group name string.
   */
  private buildGroupName(): string {
    return `Group${String(this.groupCounter + 1).padStart(3, '0')}`;
  }

  /**
   * Displays a message via the registered status callback.
   * @param message The message to display.
   */
  private showMessage(message: string): void {
    if (this.showStatusMessage) {
      this.showStatusMessage(message);
    }
  }

  /**
   * Triggers viewport sync and outliner refresh in sequence.
   */
  private notifySyncAndRefresh(): void {
    this.syncViewportsAndRefresh();
    this.notifyRefresh();
  }

  /**
   * Triggers viewport synchronization if registered.
   */
  private syncViewportsAndRefresh(): void {
    if (this.syncViewports) {
      this.syncViewports();
    }
  }

  /**
   * Triggers outliner refresh if registered.
   */
  private notifyRefresh(): void {
    if (this.refreshOutliner) {
      this.refreshOutliner();
    }
  }
}
