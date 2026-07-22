import * as THREE from 'three';
import { CommandStack } from '../commands/command_stack.js';
import { CsgBooleanCommand } from '../commands/csg_boolean_command.js';
import { CsgBooleanOps, CsgOperation } from '../csg/csg_boolean_ops.js';
import { SelectionManager } from './selection_manager.js';

/**
 * Coordinates CSG boolean actions from toolbar/shortcuts.
 */
export class CsgActionHandler {
  private worldObject: THREE.Group;
  private commandStack: CommandStack;
  private selectionManager: SelectionManager;
  private booleanOps: CsgBooleanOps;
  private syncViewports: (() => void) | null;
  private refreshOutliner: (() => void) | null;
  private showStatus: ((message: string) => void) | null;
  private resultCounter: number;

  /**
   * Creates a CSG action handler.
   * @param worldObject The scene world root.
   * @param commandStack The undo stack.
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
    this.booleanOps = new CsgBooleanOps();
    this.syncViewports = null;
    this.refreshOutliner = null;
    this.showStatus = null;
    this.resultCounter = 0;
  }

  /**
   * Sets the viewport sync callback.
   * @param callback The callback to invoke after CSG changes.
   */
  setSyncViewports(callback: () => void): void {
    this.syncViewports = callback;
  }

  /**
   * Sets the outliner refresh callback.
   * @param callback The callback to invoke after CSG changes.
   */
  setRefreshOutliner(callback: () => void): void {
    this.refreshOutliner = callback;
  }

  /**
   * Sets the status message callback.
   * @param callback The status callback.
   */
  setShowStatus(callback: (message: string) => void): void {
    this.showStatus = callback;
  }

  /**
   * Runs a boolean operation on the first two selected meshes.
   * @param operation The CSG operation to run.
   */
  runBoolean(operation: CsgOperation): void {
    const selected = this.selectionManager.getAllSelectedObjectsAsArray();
    if (selected.length < 2) {
      this.emitStatus('CSG needs two meshes — Shift+click or Ctrl+click to multi-select');
      return;
    }
    const meshA = selected[0];
    const meshB = selected[1];
    this.resultCounter += 1;
    const resultName = `CSG_${operation}_${String(this.resultCounter).padStart(3, '0')}`;
    const result = this.booleanOps.operate(meshA, meshB, operation, resultName);
    if (!result) {
      this.emitStatus('CSG produced empty geometry');
      return;
    }
    const command = new CsgBooleanCommand(meshA, meshB, result, this.worldObject);
    this.commandStack.push(command);
    this.selectionManager.selectObject(result);
    this.syncViewports?.();
    this.refreshOutliner?.();
    this.emitStatus(`CSG ${operation} created ${resultName}`);
  }

  /**
   * Emits a status message when a callback is registered.
   * @param message The message text.
   */
  private emitStatus(message: string): void {
    if (this.showStatus) {
      this.showStatus(message);
    }
  }
}
