import * as THREE from 'three';
import { CommandStack } from '../commands/command_stack.js';
import { ReparentCommand } from '../commands/reparent_command.js';
import { isDescendantOf } from '../utils/hierarchy_utils.js';
import { isObjectOrAncestorLocked } from '../utils/object_lock.js';
import { SolidModel } from '../solid/model/solid_model.js';
import { SolidBrushVisual } from '../solid/model/solid_brush_visual.js';

/**
 * Handles hierarchy drag-and-drop reparent operations from the outliner.
 */
export class HierarchyReparentHandler {
  private worldObject: THREE.Group;
  private commandStack: CommandStack;
  private syncViewports: (() => void) | null;
  private refreshOutliner: (() => void) | null;
  private showStatus: ((message: string) => void) | null;

  /**
   * Creates a hierarchy reparent handler.
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
   * @param callback Invoked after hierarchy changes.
   */
  setSyncViewports(callback: () => void): void {
    this.syncViewports = callback;
  }

  /**
   * Sets the outliner refresh callback.
   * @param callback Invoked after hierarchy changes.
   */
  setRefreshOutliner(callback: () => void): void {
    this.refreshOutliner = callback;
  }

  /**
   * Sets the status message callback.
   * @param callback Invoked with a short status string.
   */
  setShowStatus(callback: (message: string) => void): void {
    this.showStatus = callback;
  }

  /**
   * Reparents a dragged object onto a drop target using editor conventions.
   * Groups receive children; meshes receive the drop as a sibling under their parent.
   * Solid brushes may only reorder under their owning solid model root.
   * @param dragged The object being moved.
   * @param dropTarget The object that received the drop.
   */
  reparentFromDrop(dragged: THREE.Object3D, dropTarget: THREE.Object3D): void {
    if (dragged === dropTarget) return;
    if (dragged === this.worldObject) return;
    if (isObjectOrAncestorLocked(dragged)) {
      this.showStatus?.('Cannot reparent locked object');
      return;
    }
    const destination = this.resolveDestination(dragged, dropTarget);
    if (!destination) return;
    if (!this.isSolidHierarchyMoveAllowed(dragged, destination.parent)) {
      this.showStatus?.('Solid brushes must stay under their solid model');
      return;
    }
    const command = new ReparentCommand(
      dragged,
      destination.parent,
      destination.insertBefore
    );
    this.commandStack.push(command);
    SolidModel.rebuildAllUnder(this.worldObject);
    this.syncViewports?.();
    this.refreshOutliner?.();
    this.showStatus?.(`Moved ${dragged.name || 'object'} in hierarchy`);
  }

  /**
   * Chooses the new parent and optional insert-before sibling for a drop.
   * @param dragged The object being moved.
   * @param dropTarget The drop target row object.
   * @returns Parent and insert-before pair, or null if the drop is invalid.
   */
  private resolveDestination(
    dragged: THREE.Object3D,
    dropTarget: THREE.Object3D
  ): { parent: THREE.Object3D; insertBefore: THREE.Object3D | null } | null {
    if (dropTarget === dragged) return null;
    if (isDescendantOf(dropTarget, dragged)) return null;
    if (dropTarget instanceof THREE.Group || dropTarget === this.worldObject) {
      return { parent: dropTarget, insertBefore: null };
    }
    const parent = dropTarget.parent;
    if (!parent || parent === dragged) return null;
    if (isDescendantOf(parent, dragged)) return null;
    return { parent, insertBefore: dropTarget };
  }

  /**
   * Validates solid-model hierarchy constraints for a proposed reparent.
   * Brushes stay under their solid root; non-brushes cannot enter a solid root.
   * @param dragged Object being moved.
   * @param destinationParent Proposed parent.
   * @returns True when the move is safe for solid CSG ownership.
   */
  private isSolidHierarchyMoveAllowed(
    dragged: THREE.Object3D,
    destinationParent: THREE.Object3D
  ): boolean {
    if (SolidBrushVisual.isBrushObject(dragged)) {
      const model = SolidModel.fromObject(dragged);
      if (!model) return false;
      return destinationParent === model.root;
    }
    if (SolidModel.isSolidModelObject(destinationParent)) {
      return false;
    }
    return true;
  }
}
