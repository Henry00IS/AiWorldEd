import { AlignmentController } from './alignment_controller.js';
import { AlignmentAxis } from '../types/alignment_axis.js';
import { CommandStack } from '../commands/command_stack.js';
import { SelectionManager } from './selection_manager.js';
import { GridSnap } from '../transform/grid_snap.js';
import { StatusBar } from '../ui/status_bar.js';

/**
 * Callback invoked to sync scene state to all viewports.
 */
export type SyncViewportsCallback = () => void;

/**
 * Callback invoked to update the status bar axis restriction display.
 * @param axis The current axis restriction label.
 */
export type AxisRestrictionCallback = (axis: AlignmentAxis) => void;

/**
 * Centralized handler for alignment operations.
 * Coordinates alignment execution, viewport sync, and status feedback.
 */
export class AlignmentHandler {
  private alignmentController: AlignmentController;
  private commandStack: CommandStack;
  private selectionManager: SelectionManager;
  private gridSnap: GridSnap;
  private statusBar: StatusBar | null;
  private syncViewports: SyncViewportsCallback | null;
  private onAxisRestriction: AxisRestrictionCallback | null;

  /**
   * Creates a new alignment handler.
   * @param alignmentController The core alignment logic controller.
   * @param commandStack The command stack for undo support.
   * @param selectionManager The selection manager.
   * @param gridSnap The grid snap configuration.
   */
  constructor(
    alignmentController: AlignmentController,
    commandStack: CommandStack,
    selectionManager: SelectionManager,
    gridSnap: GridSnap
  ) {
    this.alignmentController = alignmentController;
    this.commandStack = commandStack;
    this.selectionManager = selectionManager;
    this.gridSnap = gridSnap;
    this.statusBar = null;
    this.syncViewports = null;
    this.onAxisRestriction = null;
  }

  /**
   * Sets the status bar reference for feedback display.
   * @param statusBar The status bar instance.
   */
  setStatusBar(statusBar: StatusBar): void {
    this.statusBar = statusBar;
  }

  /**
   * Sets the callback for synchronizing viewports after actions.
   * @param callback The synchronization function.
   */
  setSyncViewports(callback: SyncViewportsCallback): void {
    this.syncViewports = callback;
  }

  /**
   * Sets the callback for axis restriction changes.
   * @param callback The axis restriction update function.
   */
  setOnAxisRestriction(callback: AxisRestrictionCallback): void {
    this.onAxisRestriction = callback;
  }

  /**
   * Aligns selected objects to world origin on the current axis restriction.
   */
  onAlignToOrigin(): void {
    const selected = this.selectionManager.getAllSelectedObjectsAsArray();
    if (selected.length === 0) return;
    const axis = this.alignmentController.getAxisRestriction();
    this.alignmentController.alignToOrigin(
      selected,
      axis,
      this.commandStack
    );
    this.syncViewportsAndShowFeedback('origin', selected.length);
  }

  /**
   * Aligns selected objects' bounding box centers to the nearest grid cell.
   */
  onAlignToGridCenter(): void {
    const selected = this.selectionManager.getAllSelectedObjectsAsArray();
    if (selected.length === 0) return;
    const axis = this.alignmentController.getAxisRestriction();
    const snapInterval = this.gridSnap.getInterval();
    this.alignmentController.alignCenterToGrid(
      selected,
      axis,
      snapInterval,
      this.commandStack
    );
    this.syncViewportsAndShowFeedback('grid center', selected.length);
  }

  /**
   * Aligns source objects to the target reference object.
   * The last selected object serves as the alignment target.
   */
  onAlignToObject(): void {
    const selected = this.selectionManager.getAllSelectedObjectsAsArray();
    if (selected.length < 2) return;
    const target = selected[selected.length - 1];
    const sources = selected.slice(0, selected.length - 1);
    const axis = this.alignmentController.getAxisRestriction();
    this.alignmentController.alignToObject(
      sources,
      target,
      axis,
      this.commandStack
    );
    this.syncViewportsAndShowFeedback('object', sources.length);
  }

  /**
   * Cycles the axis restriction and notifies registered callbacks.
   */
  onAxisCycle(): void {
    const axis = this.alignmentController.cycleAxisRestriction();
    this.notifyAxisRestriction(axis);
  }

  /**
   * Returns the current axis restriction.
   * @returns The current alignment axis.
   */
  getAxisRestriction(): AlignmentAxis {
    return this.alignmentController.getAxisRestriction();
  }

  /**
   * Syncs viewports and displays alignment feedback.
   * @param target The alignment target description.
   * @param count The number of objects aligned.
   */
  private syncViewportsAndShowFeedback(target: string, count: number): void {
    if (this.syncViewports) {
      this.syncViewports();
    }
    this.showAlignmentFeedback(target, count);
  }

  /**
   * Displays alignment feedback in the status bar.
   * @param target The alignment target description.
   * @param count The number of objects aligned.
   */
  private showAlignmentFeedback(target: string, count: number): void {
    if (this.statusBar) {
      this.statusBar.setLastAction(`Aligned ${count} object(s) to ${target}`);
    }
  }

  /**
   * Notifies the axis restriction callback of a change.
   * @param axis The new axis restriction.
   */
  private notifyAxisRestriction(axis: AlignmentAxis): void {
    if (this.onAxisRestriction) {
      this.onAxisRestriction(axis);
    }
  }
}
