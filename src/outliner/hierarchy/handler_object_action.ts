import * as THREE from 'three';
import { CommandObjectDelete, DeleteSnapshot } from '@/outliner/commands/command_object_delete.js';
import { CommandObjectHierarchyDelete } from '@/outliner/commands/command_object_hierarchy_delete.js';
import { CommandObjectDuplicate } from '@/outliner/commands/command_object_duplicate.js';
import { CommandSolidBrushesDuplicate } from '@/solid/commands/brushes/command_solid_brushes_duplicate.js';
import { CommandSolidBrushesDelete } from '@/solid/commands/brushes/command_solid_brushes_delete.js';
import { CommandObjectGroup } from '@/outliner/commands/command_object_group.js';
import { CommandObjectUngroup } from '@/outliner/commands/command_object_ungroup.js';
import { CommandStack } from '@/commands/command_stack.js';
import type { UndoCommand } from '@/commands/command_undo.js';
import { CommandUndoBatch } from '@/commands/command_undo_batch.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { collapseToHierarchyRoots, findCommonParent } from '@/utils/hierarchy_selection.js';
import { filterUnlockedObjects, isObjectOrAncestorLocked } from '@/utils/object_lock.js';
import { collectMeshesUnder } from '@/utils/utils_hierarchy.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { findSolidModelRoot, isSolidCsgGroup, markAsSolidCsgGroup } from '@/solid/model/solid_group.js';
import { hierarchyNameAllocator } from '@/utils/utils_hierarchy_name_allocator.js';

/** Callback invoked to sync scene state to all viewports. */
export type SyncViewportsCallback = () => void;

/** Callback invoked to refresh the outliner panel. */
export type RefreshOutlinerCallback = () => void;

/**
 * Callback that copies outliner expand/collapse state from a source hierarchy
 * root onto a clone after duplicate.
 *
 * @param sourceRoot Source hierarchy root.
 * @param cloneRoot Clone hierarchy root.
 */
export type MirrorExpandStateCallback = (sourceRoot: THREE.Object3D, cloneRoot: THREE.Object3D) => void;

/**
 * Callback invoked to show a status message.
 *
 * @param message The status message to display.
 */
export type StatusMessageCallback = (message: string) => void;

/**
 * Guard that marks hierarchy objects as non-deletable (e.g. Edit Mode domain).
 *
 * @param object Candidate for deletion.
 * @returns True when delete must be refused for this object.
 */
export type ObjectDeleteProtectionGuard = (object: THREE.Object3D) => boolean;

/**
 * Centralized handler for object-level actions: delete, duplicate, group,
 * ungroup. Coordinates command execution, viewport sync, outliner refresh, and
 * feedback.
 */
export class HandlerObjectAction {
  private worldObject: THREE.Group;
  private commandStack: CommandStack;
  private selectionManager: ManagerSelection;
  private syncViewports: SyncViewportsCallback | null;
  private refreshOutliner: RefreshOutlinerCallback | null;
  private mirrorExpandState: MirrorExpandStateCallback | null;
  private showStatusMessage: StatusMessageCallback | null;
  private deleteProtectionGuard: ObjectDeleteProtectionGuard | null;

  /**
   * Creates a new object action handler.
   *
   * @param worldObject The root group containing scene objects.
   * @param commandStack The command stack for undo support.
   * @param selectionManager The selection manager.
   */
  constructor(worldObject: THREE.Group, commandStack: CommandStack, selectionManager: ManagerSelection) {
    this.worldObject = worldObject;
    this.commandStack = commandStack;
    this.selectionManager = selectionManager;
    this.syncViewports = null;
    this.refreshOutliner = null;
    this.mirrorExpandState = null;
    this.showStatusMessage = null;
    this.deleteProtectionGuard = null;
  }

  /**
   * Sets the callback for synchronizing viewports after actions.
   *
   * @param callback The synchronization function.
   */
  setSyncViewports(callback: SyncViewportsCallback): void {
    this.syncViewports = callback;
  }

  /**
   * Sets the callback for refreshing the outliner after actions.
   *
   * @param callback The outliner refresh function.
   */
  setRefreshOutliner(callback: RefreshOutlinerCallback): void {
    this.refreshOutliner = callback;
  }

  /**
   * Sets the callback that mirrors outliner expand state after hierarchy
   * duplicate.
   *
   * @param callback Source-to-clone expand copy function.
   */
  setMirrorExpandState(callback: MirrorExpandStateCallback): void {
    this.mirrorExpandState = callback;
  }

  /**
   * Sets the callback for showing status bar messages.
   *
   * @param callback The status message function.
   */
  setShowStatusMessage(callback: StatusMessageCallback): void {
    this.showStatusMessage = callback;
  }

  /**
   * Registers a guard that blocks deleting Edit Mode domain objects (and their
   * ancestors that would remove them).
   *
   * @param guard Protection predicate, or null to clear.
   */
  setDeleteProtectionGuard(guard: ObjectDeleteProtectionGuard | null): void {
    this.deleteProtectionGuard = guard;
  }

  /**
   * Handles deletion of selected meshes (viewport mesh selection). Solid
   * brushes are unregistered from their solid model so CSG drops them.
   */
  onDeleteSelected(): void {
    const selected = this.selectionManager.getSelectedObjects();
    if (selected.size === 0) return;
    const unlocked = filterUnlockedObjects(Array.from(selected));
    if (unlocked.length === 0) {
      this.showMessage('Cannot delete locked object(s)');
      return;
    }
    const toRemove = this.filterDeletableObjects(unlocked).filter(
      (object): object is THREE.Mesh => object instanceof THREE.Mesh,
    );
    if (toRemove.length === 0) {
      return;
    }
    this.deleteMeshesWithSolidSupport(toRemove);
  }

  /**
   * Deletes hierarchy roots (meshes, groups, empty groups) from the scene.
   * Solid brushes under those roots are unregistered from their solid models so
   * CSG and geometry stay in sync with the outliner.
   *
   * @param objects Hierarchy nodes to remove.
   */
  deleteHierarchyObjects(objects: THREE.Object3D[]): void {
    const unlockedRoots = filterUnlockedObjects(
      collapseToHierarchyRoots(objects).filter((object) => object !== this.worldObject),
    );
    if (unlockedRoots.length === 0) {
      this.showMessage('Cannot delete locked object(s)');
      return;
    }
    const roots = this.filterDeletableObjects(unlockedRoots);
    if (roots.length === 0) {
      return;
    }
    const solidBrushes = this.solidBrushMeshesCollectFromRoots(roots);
    const otherRoots = this.hierarchyRootsExcludeBrushMeshes(roots);
    this.commandStackPushDeleteSteps(this.hierarchyDeleteStepsBuild(solidBrushes, otherRoots));
    this.selectionManager.clearSelection();
    this.notifySyncAndRefresh();
    this.showMessage(`Deleted ${roots.length} object(s)`);
  }

  /**
   * Drops objects protected by the delete guard and reports when any were
   * blocked.
   *
   * @param objects Candidates after lock filtering.
   * @returns Objects allowed to delete.
   */
  private filterDeletableObjects(objects: readonly THREE.Object3D[]): THREE.Object3D[] {
    if (!this.deleteProtectionGuard) {
      return objects.slice();
    }
    const allowed: THREE.Object3D[] = [];
    let blockedCount = 0;
    for (const object of objects) {
      if (this.deleteProtectionGuard(object)) {
        blockedCount += 1;
        continue;
      }
      allowed.push(object);
    }
    if (blockedCount > 0) {
      this.showMessage('Cannot delete objects being edited in Edit Mode');
    }
    return allowed;
  }

  /**
   * Builds ordered delete steps: solid brushes first, then hierarchy roots.
   *
   * @param solidBrushes Solid brush meshes to unregister.
   * @param otherRoots Non-brush hierarchy roots to remove.
   * @returns Ordered undoable steps for one history entry.
   */
  private hierarchyDeleteStepsBuild(
    solidBrushes: readonly THREE.Mesh[],
    otherRoots: readonly THREE.Object3D[],
  ): UndoCommand[] {
    const steps: UndoCommand[] = [];
    if (solidBrushes.length > 0) {
      steps.push(new CommandSolidBrushesDelete([...solidBrushes]));
    }
    if (otherRoots.length > 0) {
      steps.push(new CommandObjectHierarchyDelete([...otherRoots]));
    }
    return steps;
  }

  /**
   * Pushes one history entry for delete steps (single command or atomic batch).
   *
   * @param steps Ordered delete sub-commands.
   */
  private commandStackPushDeleteSteps(steps: readonly UndoCommand[]): void {
    if (steps.length === 0) {
      return;
    }
    if (steps.length === 1) {
      this.commandStack.push(steps[0]!);
      return;
    }
    this.commandStack.push(new CommandUndoBatch(steps));
  }

  /**
   * Collects unique solid brush preview meshes under hierarchy roots (including
   * the roots themselves when they are brush meshes).
   *
   * @param roots Hierarchy roots being deleted.
   * @returns Solid brush meshes for CSG unregistration.
   */
  private solidBrushMeshesCollectFromRoots(roots: readonly THREE.Object3D[]): THREE.Mesh[] {
    const solidBrushes: THREE.Mesh[] = [];
    const seen = new Set<THREE.Mesh>();
    for (const root of roots) {
      this.solidBrushMeshesAppendUnder(root, solidBrushes, seen);
    }
    return solidBrushes;
  }

  /**
   * Appends solid brush meshes found at or under one hierarchy root.
   *
   * @param root Hierarchy root to scan.
   * @param solidBrushes Accumulator list.
   * @param seen Deduping set of mesh identities.
   */
  private solidBrushMeshesAppendUnder(root: THREE.Object3D, solidBrushes: THREE.Mesh[], seen: Set<THREE.Mesh>): void {
    for (const mesh of collectMeshesUnder(root)) {
      if (!SolidBrushVisual.isBrushObject(mesh)) {
        continue;
      }
      if (seen.has(mesh)) {
        continue;
      }
      seen.add(mesh);
      solidBrushes.push(mesh);
    }
  }

  /**
   * Filters hierarchy roots to non-brush nodes (groups, solid models, regular
   * meshes) so solid brush meshes are only handled by solid delete.
   *
   * @param roots Hierarchy roots being deleted.
   * @returns Roots to remove via hierarchy delete.
   */
  private hierarchyRootsExcludeBrushMeshes(roots: readonly THREE.Object3D[]): THREE.Object3D[] {
    const otherRoots: THREE.Object3D[] = [];
    for (const root of roots) {
      if (root instanceof THREE.Mesh && SolidBrushVisual.isBrushObject(root)) {
        continue;
      }
      otherRoots.push(root);
    }
    return otherRoots;
  }

  /**
   * Deletes meshes, routing solid brushes through solid-model removal.
   *
   * @param meshes Meshes to delete.
   */
  private deleteMeshesWithSolidSupport(meshes: THREE.Mesh[]): void {
    const solidBrushes = CommandSolidBrushesDelete.filterBrushMeshes(meshes);
    const regularMeshes = meshes.filter((mesh) => !SolidBrushVisual.isBrushObject(mesh));
    const steps: UndoCommand[] = [];
    if (solidBrushes.length > 0) {
      steps.push(new CommandSolidBrushesDelete(solidBrushes));
    }
    if (regularMeshes.length > 0) {
      steps.push(new CommandObjectDelete(this.buildDeleteSnapshots(regularMeshes)));
    }
    this.commandStackPushDeleteSteps(steps);
    this.selectionManager.clearSelection();
    this.notifySyncAndRefresh();
  }

  /**
   * Handles duplication of selected objects. Prefers inspector hierarchy roots
   * (groups and brushes) so solid CSG groups duplicate as whole subtrees.
   */
  onDuplicateSelected(): void {
    const inspectorObjects = this.selectionManager.getInspectorObjects();
    if (inspectorObjects.length > 0) {
      this.duplicateHierarchyObjects(inspectorObjects);
      return;
    }
    const selected = this.selectionManager.getSelectedObjects();
    if (selected.size === 0) return;
    this.duplicateHierarchyObjects(Array.from(selected));
  }

  /**
   * Duplicates hierarchy roots: solid model roots, solid CSG groups, solid
   * brushes, and regular meshes. Nested selection collapses to outermost roots
   * first.
   *
   * @param objects Selected hierarchy nodes.
   */
  duplicateHierarchyObjects(objects: THREE.Object3D[]): void {
    const roots = filterUnlockedObjects(
      collapseToHierarchyRoots(objects).filter((object) => object !== this.worldObject),
    );
    if (roots.length === 0) {
      this.showMessage('Cannot duplicate locked object(s)');
      return;
    }
    const solidNodes: THREE.Object3D[] = [];
    const regularMeshes: THREE.Mesh[] = [];
    for (const root of roots) {
      if (SolidModel.isSolidModelObject(root)) {
        solidNodes.push(root);
        continue;
      }
      if (isSolidCsgGroup(root)) {
        solidNodes.push(root);
        continue;
      }
      if (root instanceof THREE.Mesh && SolidBrushVisual.isBrushObject(root)) {
        solidNodes.push(root);
        continue;
      }
      if (root instanceof THREE.Mesh) {
        regularMeshes.push(root);
      }
    }
    const clonedMeshes: THREE.Mesh[] = [];
    const clonedInspector: THREE.Object3D[] = [];
    const solidExpandSources: THREE.Object3D[] = [];
    const solidExpandClones: THREE.Object3D[] = [];
    if (solidNodes.length > 0) {
      const solidCommand = new CommandSolidBrushesDuplicate(solidNodes, new THREE.Vector3(0, 0, 0));
      this.commandStack.push(solidCommand);
      clonedMeshes.push(...solidCommand.getClonedMeshes());
      const solidClones = solidCommand.getClonedInspectorRoots();
      clonedInspector.push(...solidClones);
      solidExpandSources.push(...solidNodes);
      solidExpandClones.push(...solidClones);
      this.mirrorExpandStateForPairs(solidExpandSources, solidExpandClones);
    }
    if (regularMeshes.length > 0) {
      const regularCommand = new CommandObjectDuplicate(regularMeshes, this.worldObject, new THREE.Vector3(0, 0, 0));
      this.commandStack.push(regularCommand);
      clonedMeshes.push(...regularCommand.getClonedMeshes());
      clonedInspector.push(...regularCommand.getClonedMeshes());
    }
    this.syncViewportsAndRefresh();
    if (clonedMeshes.length > 0 || clonedInspector.length > 0) {
      this.selectionManager.setSelection(clonedMeshes, clonedInspector);
    }
    // Selection reveal expands ancestors of focused rows; re-apply so a closed
    // source group does not leave its clone open after child brushes are selected.
    this.mirrorExpandStateForPairs(solidExpandSources, solidExpandClones);
    this.showDuplicateFeedback(Math.max(clonedInspector.length, clonedMeshes.length));
    this.notifyRefresh();
  }

  /** Handles grouping of selected objects. */
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
   * Groups the provided objects after excluding locked ones, or shows a status
   * message when none remain unlocked.
   *
   * @param objects Candidate objects to group.
   */
  groupObjects(objects: THREE.Object3D[]): void {
    const unlocked = filterUnlockedObjects(objects);
    if (unlocked.length === 0) {
      this.showMessage('Cannot group locked object(s)');
      return;
    }
    this.executeGroup(unlocked);
  }

  /** Handles ungrouping of the selected object's parent group. */
  onUngroupSelected(): void {
    const firstSelected = this.selectionManager.getFirstSelectedObject();
    if (!firstSelected) return;
    const groupTarget = this.findGroupTarget(firstSelected);
    if (!groupTarget) return;
    this.ungroupGroup(groupTarget);
  }

  /**
   * Ungroups the given group when it is not locked, refreshes hierarchy state
   * from its former children, and notifies viewport sync and outliner refresh.
   *
   * @param group The group to ungroup.
   */
  ungroupGroup(group: THREE.Group): void {
    if (isObjectOrAncestorLocked(group)) {
      this.showMessage('Cannot ungroup locked group');
      return;
    }
    const hierarchySeeds = group.children.slice();
    const command = new CommandObjectUngroup(group);
    this.commandStack.push(command);
    SolidModel.hierarchyMutationRefreshFromRoots(hierarchySeeds);
    this.notifySyncAndRefresh();
  }

  /**
   * Builds delete snapshots for all meshes to be deleted.
   *
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
        material: (mesh.material as THREE.Material).clone(),
      };
      snapshots.push(snapshot);
    });
    return snapshots;
  }

  /**
   * Returns unlocked objects from the current selection for grouping.
   *
   * @returns Unlocked selected objects ready to group.
   */
  private buildGroupObjectsFromSelection(): THREE.Object3D[] {
    return filterUnlockedObjects(this.selectionManager.getAllSelectedObjectsAsArray());
  }

  /**
   * Executes the group command and triggers post-action notifications. New
   * group is parented under the common parent of the members so nesting builds
   * a tree instead of always dumping into the world root. Groups created under
   * a solid model become solid CSG compounds so hierarchical operations work.
   * Selection moves to the new group so nested groups do not keep the old row.
   *
   * @param objects The objects to group together.
   */
  private executeGroup(objects: THREE.Object3D[]): void {
    const members = collapseToHierarchyRoots(objects);
    if (members.length === 0) return;
    if (!this.canGroupSolidMembers(members)) {
      this.showMessage('Solid brushes must stay under their solid model');
      return;
    }
    const groupName = this.buildGroupName();
    const parent = findCommonParent(members, this.worldObject);
    const command = new CommandObjectGroup(members, parent, groupName);
    this.commandStack.push(command);
    const createdGroup = command.getGroup();
    this.finalizeSolidGroupIfNeeded(createdGroup, members);
    SolidModel.hierarchyMutationRefreshFromRoots([createdGroup]);
    this.selectCreatedGroup(createdGroup);
    this.notifySyncAndRefresh();
    this.showGroupFeedback(groupName);
  }

  /**
   * Selects the newly created group as the hierarchy focus, with descendant
   * meshes as the viewport selection.
   *
   * @param group The group to select as hierarchy focus.
   */
  private selectCreatedGroup(group: THREE.Group): void {
    const meshes = this.collectSelectionMeshesUnder(group);
    this.selectionManager.setSelection(meshes, [group]);
  }

  /**
   * Collects meshes under a hierarchy node for viewport selection, skipping
   * solid result meshes so solid roots stay transformable as units.
   *
   * @param root Hierarchy node to scan.
   * @returns Selection meshes under the root.
   */
  private collectSelectionMeshesUnder(root: THREE.Object3D): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    collectMeshesUnder(root).forEach((mesh) => {
      if (SolidModel.isResultMesh(mesh)) {
        return;
      }
      meshes.push(mesh);
    });
    return meshes;
  }

  /**
   * Returns whether solid members share a valid common solid parent for
   * grouping. Non-solid members always pass.
   *
   * @param members Hierarchy roots to group.
   * @returns False when solid brushes would leave their solid model.
   */
  private canGroupSolidMembers(members: THREE.Object3D[]): boolean {
    const solidRoots = new Set<THREE.Object3D>();
    for (const member of members) {
      const solidRoot = findSolidModelRoot(member);
      if (solidRoot) solidRoots.add(solidRoot);
      if (SolidBrushVisual.isBrushObject(member) && !solidRoot) return false;
    }
    if (solidRoots.size === 0) return true;
    if (solidRoots.size > 1) return false;
    const solidRoot = solidRoots.values().next().value as THREE.Object3D;
    for (const member of members) {
      if (!findSolidModelRoot(member) && member !== solidRoot) return false;
    }
    return true;
  }

  /**
   * Marks a newly created group as a solid CSG compound when it lives under a
   * solid model.
   *
   * @param group The group that may become a solid CSG compound.
   * @param members Grouped members used to detect solid ownership.
   */
  private finalizeSolidGroupIfNeeded(group: THREE.Group, members: THREE.Object3D[]): void {
    const solidRoot = findSolidModelRoot(group) ?? members.map(findSolidModelRoot).find((root) => root !== null);
    if (!solidRoot) return;
    markAsSolidCsgGroup(group);
  }

  /**
   * Finds the group target for ungrouping from a selected mesh.
   *
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
   * Mirrors outliner expand/collapse state for each source/clone pair.
   *
   * @param sources Source hierarchy roots that were duplicated.
   * @param clones Clone roots in the same order as sources.
   */
  private mirrorExpandStateForPairs(sources: readonly THREE.Object3D[], clones: readonly THREE.Object3D[]): void {
    if (!this.mirrorExpandState) {
      return;
    }
    const pairCount = Math.min(sources.length, clones.length);
    for (let index = 0; index < pairCount; index++) {
      const source = sources[index];
      const clone = clones[index];
      if (!source || !clone) {
        continue;
      }
      this.mirrorExpandState(source, clone);
    }
  }

  /**
   * Shows a feedback message in the status bar for duplication.
   *
   * @param count The number of objects that were duplicated.
   */
  private showDuplicateFeedback(count: number): void {
    this.showMessage(`Duplicated ${count} object(s)`);
  }

  /**
   * Shows a feedback message in the status bar for grouping.
   *
   * @param groupName The name of the newly created group.
   */
  private showGroupFeedback(groupName: string): void {
    this.showMessage(`Created group: ${groupName}`);
  }

  /**
   * Builds the next unique group display name from the global allocator.
   *
   * @returns A formatted group name string.
   */
  private buildGroupName(): string {
    return hierarchyNameAllocator.allocate('Group');
  }

  /**
   * Displays a message via the registered status callback.
   *
   * @param message The message to display.
   */
  private showMessage(message: string): void {
    if (this.showStatusMessage) {
      this.showStatusMessage(message);
    }
  }

  /** Triggers viewport sync and outliner refresh in sequence. */
  private notifySyncAndRefresh(): void {
    this.syncViewportsAndRefresh();
    this.notifyRefresh();
  }

  /** Triggers viewport synchronization if registered. */
  private syncViewportsAndRefresh(): void {
    if (this.syncViewports) {
      this.syncViewports();
    }
  }

  /** Triggers outliner refresh if registered. */
  private notifyRefresh(): void {
    if (this.refreshOutliner) {
      this.refreshOutliner();
    }
  }
}
