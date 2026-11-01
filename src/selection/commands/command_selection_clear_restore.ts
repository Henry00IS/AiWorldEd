import * as THREE from 'three';
import { UndoCommand } from '@/commands/command_undo.js';
import type { ManagerSelection } from '@/selection/object/manager_selection.js';

/**
 * History step that clears the object selection on execute and restores the
 * selection captured at construction on undo. Placed first in a batch, its undo
 * runs last, after the batch's other steps restored the scene objects.
 */
export class CommandSelectionClearRestore implements UndoCommand {
  private readonly selectionManager: ManagerSelection;
  private readonly selectedMeshes: THREE.Mesh[];
  private readonly inspectorObjects: THREE.Object3D[];

  /**
   * Captures the current selection so undo can bring it back.
   *
   * @param selectionManager Selection manager to clear and restore.
   */
  constructor(selectionManager: ManagerSelection) {
    this.selectionManager = selectionManager;
    this.selectedMeshes = selectionManager.getAllSelectedObjectsAsArray();
    this.inspectorObjects = selectionManager.getInspectorObjects();
  }

  /** Clears the selection. */
  execute(): void {
    this.selectionManager.clearSelection();
  }

  /** Restores the selection captured at construction. */
  undo(): void {
    this.selectionManager.setSelection(this.selectedMeshes, this.inspectorObjects);
  }
}
