import * as THREE from 'three';
import { CommandStack } from '@/commands/command_stack.js';
import { CommandObjectReparent } from '@/outliner/commands/command_object_reparent.js';
import { ReparentMove, CommandObjectObjectsReparent } from '@/outliner/commands/command_object_objects_reparent.js';
import { isDescendantOf, sortObjectsBySceneOrder } from '@/utils/utils_hierarchy.js';
import { isEditorHelperObject } from '@/utils/mesh_edge_sync.js';
import { isObjectOrAncestorLocked } from '@/utils/object_lock.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { findSolidModelRoot, isSolidCsgGroup, markAsSolidCsgGroup } from '@/solid/model/solid_group.js';
import { hierarchyMoveSolidAllowed } from '@/outliner/hierarchy/hierarchy_move_solid_rules.js';
import type { OutlinerDropPlacement } from '@/outliner/ui/outliner_drop_placement.js';

/** Handles hierarchy drag-and-drop reparent operations from the outliner. */
export class HandlerHierarchyReparent {
  private worldObject: THREE.Group;
  private commandStack: CommandStack;
  private syncViewports: (() => void) | null;
  private refreshOutliner: (() => void) | null;
  private showStatus: ((message: string) => void) | null;

  /**
   * Creates a hierarchy reparent handler.
   *
   * @param worldObject The scene world root.
   * @param commandStack The undo stack.
   */
  constructor(worldObject: THREE.Group, commandStack: CommandStack) {
    this.worldObject = worldObject;
    this.commandStack = commandStack;
    this.syncViewports = null;
    this.refreshOutliner = null;
    this.showStatus = null;
  }

  /**
   * Sets the viewport sync callback.
   *
   * @param callback Invoked after hierarchy changes.
   */
  setSyncViewports(callback: () => void): void {
    this.syncViewports = callback;
  }

  /**
   * Sets the outliner refresh callback.
   *
   * @param callback Invoked after hierarchy changes.
   */
  setRefreshOutliner(callback: () => void): void {
    this.refreshOutliner = callback;
  }

  /**
   * Sets the status message callback.
   *
   * @param callback Invoked with a short status string.
   */
  setShowStatus(callback: (message: string) => void): void {
    this.showStatus = callback;
  }

  /**
   * Reparents one or more dragged objects onto a drop target using vertical
   * placement. Multi-select drops move every candidate that is valid for the
   * destination (scene order preserved). Before/after reorder as siblings; into
   * nests under groups. Solid brushes may only reorder under their owning solid
   * model root.
   *
   * @param dragged Object or objects being moved.
   * @param dropTarget The object that received the drop.
   * @param placement Vertical drop placement from the outliner insert line.
   */
  reparentFromDrop(
    dragged: THREE.Object3D | readonly THREE.Object3D[],
    dropTarget: THREE.Object3D,
    placement: OutlinerDropPlacement = 'into',
  ): void {
    const movers = this.collectValidMovers(dragged, dropTarget);
    if (movers.length === 0) return;
    const destination = this.resolveDestination(movers, dropTarget, placement);
    if (!destination) return;
    const moves = this.buildAllowedMoves(movers, destination);
    if (moves.length === 0) return;
    this.commitMoves(moves);
  }

  /**
   * Filters and orders candidates for a multi-reparent drop.
   *
   * @param dragged Object or objects from the outliner drop.
   * @param dropTarget Drop target row (never moved into itself).
   * @returns Scene-ordered movers ready for destination resolution.
   */
  private collectValidMovers(
    dragged: THREE.Object3D | readonly THREE.Object3D[],
    dropTarget: THREE.Object3D,
  ): THREE.Object3D[] {
    const raw = Array.isArray(dragged) ? dragged.slice() : [dragged as THREE.Object3D];
    const unique = this.dedupeMovers(raw);
    const filtered = unique.filter((object) => this.isCandidateMover(object, dropTarget));
    return sortObjectsBySceneOrder(filtered);
  }

  /**
   * Deduplicates mover references while preserving input order.
   *
   * @param objects Candidate movers.
   * @returns Unique objects.
   */
  private dedupeMovers(objects: readonly THREE.Object3D[]): THREE.Object3D[] {
    const seen = new Set<THREE.Object3D>();
    const result: THREE.Object3D[] = [];
    for (const object of objects) {
      if (seen.has(object)) continue;
      seen.add(object);
      result.push(object);
    }
    return result;
  }

  /**
   * Returns whether an object may be included in a reparent batch.
   *
   * @param object Candidate mover.
   * @param dropTarget Drop target row.
   * @returns False for world root, target, locked, or nesting cycles.
   */
  private isCandidateMover(object: THREE.Object3D, dropTarget: THREE.Object3D): boolean {
    if (object === dropTarget) return false;
    if (object === this.worldObject) return false;
    if (isObjectOrAncestorLocked(object)) return false;
    if (isDescendantOf(dropTarget, object)) return false;
    return true;
  }

  /**
   * Builds reparent moves that pass solid hierarchy rules for the destination.
   *
   * @param movers Scene-ordered objects to move.
   * @param destination Shared parent and insert-before for the batch.
   * @returns Moves ready to commit, or empty when none are allowed.
   */
  private buildAllowedMoves(
    movers: readonly THREE.Object3D[],
    destination: { parent: THREE.Object3D; insertBefore: THREE.Object3D | null },
  ): ReparentMove[] {
    const moves: ReparentMove[] = [];
    let rejectedSolid = false;
    for (const object of movers) {
      if (!hierarchyMoveSolidAllowed(object, destination.parent)) {
        rejectedSolid = true;
        continue;
      }
      moves.push({
        object,
        newParent: destination.parent,
        insertBefore: destination.insertBefore,
      });
    }
    if (moves.length === 0 && rejectedSolid) {
      this.showStatus?.('Solid brushes and generators must stay under their solid model');
    }
    return moves;
  }

  /**
   * Pushes a single or multi reparent command and refreshes the editor.
   *
   * @param moves Valid ordered moves to apply.
   */
  private commitMoves(moves: readonly ReparentMove[]): void {
    if (moves.length === 1) {
      const only = moves[0]!;
      this.commandStack.push(new CommandObjectReparent(only.object, only.newParent, only.insertBefore));
    } else {
      this.commandStack.push(new CommandObjectObjectsReparent(moves));
    }
    this.ensureSolidGroupMarker(moves[0]!.newParent);
    SolidModel.hierarchyMutationRefreshFromRoots(moves.map((move) => move.object));
    this.syncViewports?.();
    this.refreshOutliner?.();
    this.showMoveStatus(moves);
  }

  /**
   * Shows a short status string for a completed reparent batch.
   *
   * @param moves Applied moves.
   */
  private showMoveStatus(moves: readonly ReparentMove[]): void {
    if (moves.length === 1) {
      this.showStatus?.(`Moved ${moves[0]!.object.name || 'object'} in hierarchy`);
      return;
    }
    this.showStatus?.(`Moved ${moves.length} objects in hierarchy`);
  }

  /**
   * Chooses the new parent and optional insert-before sibling for a drop.
   *
   * @param movers Objects being moved (used for cycle and skip checks).
   * @param dropTarget The drop target row object.
   * @param placement Vertical drop placement relative to the target row.
   * @returns Parent and insert-before pair, or null if the drop is invalid.
   */
  private resolveDestination(
    movers: readonly THREE.Object3D[],
    dropTarget: THREE.Object3D,
    placement: OutlinerDropPlacement,
  ): { parent: THREE.Object3D; insertBefore: THREE.Object3D | null } | null {
    const moverSet = new Set(movers);
    if (placement === 'into') {
      return this.resolveIntoDestination(dropTarget, moverSet);
    }
    return this.resolveSiblingDestination(dropTarget, placement, moverSet);
  }

  /**
   * Nests under a group target, or falls back to insert-before for leaves.
   *
   * @param dropTarget Drop target row.
   * @param movers Objects being moved (excluded from insert-before walks).
   * @returns Parent and insert-before pair, or null if invalid.
   */
  private resolveIntoDestination(
    dropTarget: THREE.Object3D,
    movers: ReadonlySet<THREE.Object3D>,
  ): { parent: THREE.Object3D; insertBefore: THREE.Object3D | null } | null {
    if (dropTarget instanceof THREE.Group || dropTarget === this.worldObject) {
      if (movers.has(dropTarget)) return null;
      return { parent: dropTarget, insertBefore: null };
    }
    return this.resolveSiblingDestination(dropTarget, 'before', movers);
  }

  /**
   * Places movers as siblings before or after the target.
   *
   * @param dropTarget Drop target row.
   * @param placement Before or after the target.
   * @param movers Objects being moved (excluded from insert-before walks).
   * @returns Parent and insert-before pair, or null if invalid.
   */
  private resolveSiblingDestination(
    dropTarget: THREE.Object3D,
    placement: 'before' | 'after',
    movers: ReadonlySet<THREE.Object3D>,
  ): { parent: THREE.Object3D; insertBefore: THREE.Object3D | null } | null {
    const parent = dropTarget.parent;
    if (!parent) return null;
    if (movers.has(parent)) return null;
    if (this.isParentUnderAnyMover(parent, movers)) return null;
    if (placement === 'before') {
      return { parent, insertBefore: movers.has(dropTarget) ? null : dropTarget };
    }
    return { parent, insertBefore: this.findNextContentSibling(dropTarget, movers) };
  }

  /**
   * Returns whether the destination parent sits under any mover (cycle risk).
   *
   * @param parent Proposed parent.
   * @param movers Objects being moved.
   * @returns True when parent is a descendant of a mover.
   */
  private isParentUnderAnyMover(parent: THREE.Object3D, movers: ReadonlySet<THREE.Object3D>): boolean {
    for (const mover of movers) {
      if (isDescendantOf(parent, mover)) return true;
    }
    return false;
  }

  /**
   * Finds the next non-helper sibling after a target for insert-after drops.
   * Skips every object in the move set so multi-reorder stays stable.
   *
   * @param dropTarget Sibling to insert after.
   * @param movers Objects being moved (excluded from insert-before).
   * @returns Next content sibling, or null to append at the end.
   */
  private findNextContentSibling(
    dropTarget: THREE.Object3D,
    movers: ReadonlySet<THREE.Object3D>,
  ): THREE.Object3D | null {
    const parent = dropTarget.parent;
    if (!parent) return null;
    const index = parent.children.indexOf(dropTarget);
    if (index < 0) return null;
    for (let childIndex = index + 1; childIndex < parent.children.length; childIndex++) {
      const sibling = parent.children[childIndex];
      if (!sibling || movers.has(sibling)) continue;
      if (isEditorHelperObject(sibling)) continue;
      return sibling;
    }
    return null;
  }

  /**
   * After a successful reparent into a solid model, ensures plain groups that
   * received solid brushes become solid CSG groups.
   *
   * @param destinationParent Parent that received the drop.
   */
  ensureSolidGroupMarker(destinationParent: THREE.Object3D): void {
    if (!(destinationParent instanceof THREE.Group)) return;
    if (SolidModel.isSolidModelObject(destinationParent)) return;
    if (!findSolidModelRoot(destinationParent)) return;
    if (isSolidCsgGroup(destinationParent)) return;
    markAsSolidCsgGroup(destinationParent);
  }
}
