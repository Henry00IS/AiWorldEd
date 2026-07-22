import * as THREE from 'three';
import { CommandStack } from '../commands/command_stack.js';
import { SelectionManager } from './selection_manager.js';
import { ObjectActionHandler } from './object_action_handler.js';
import { CsgActionHandler } from './csg_action_handler.js';
import { AlignmentHandler } from './alignment_handler.js';
import { AlignmentController } from './alignment_controller.js';
import { GridSnap } from '../transform/grid_snap.js';
import { StatusBar } from '../ui/status_bar.js';
import { AlignmentAxis } from '../types/alignment_axis.js';

/**
 * Callbacks shared by object, CSG, and alignment action handlers.
 */
export interface ActionHandlerSharedCallbacks {
  syncViewports: () => void;
  refreshOutliner: () => void;
  showStatusMessage: (message: string) => void;
  onAxisRestrictionChanged: (axis: AlignmentAxis) => void;
  statusBar: StatusBar | null;
}

/**
 * Creates and wires object, CSG, and alignment action handlers.
 * @param worldObject Root scene hierarchy group.
 * @param commandStack Undo/redo stack.
 * @param selectionManager Shared selection manager.
 * @param gridSnap Grid snap used by alignment.
 * @param callbacks Shared viewport/outliner/status callbacks.
 * @returns Wired object, CSG, and alignment handlers.
 */
export function createWiredActionHandlers(
  worldObject: THREE.Group,
  commandStack: CommandStack,
  selectionManager: SelectionManager,
  gridSnap: GridSnap,
  callbacks: ActionHandlerSharedCallbacks
): {
  objectActionHandler: ObjectActionHandler;
  csgActionHandler: CsgActionHandler;
  alignmentHandler: AlignmentHandler;
} {
  const objectActionHandler = new ObjectActionHandler(
    worldObject,
    commandStack,
    selectionManager
  );
  bindObjectActionCallbacks(objectActionHandler, callbacks);
  const csgActionHandler = new CsgActionHandler(
    worldObject,
    commandStack,
    selectionManager
  );
  bindCsgActionCallbacks(csgActionHandler, callbacks);
  const alignmentHandler = createAlignmentHandler(
    commandStack,
    selectionManager,
    gridSnap
  );
  bindAlignmentCallbacks(alignmentHandler, callbacks);
  return { objectActionHandler, csgActionHandler, alignmentHandler };
}

/**
 * Binds object-action handler callbacks.
 * @param handler Object action handler.
 * @param callbacks Shared callbacks.
 */
function bindObjectActionCallbacks(
  handler: ObjectActionHandler,
  callbacks: ActionHandlerSharedCallbacks
): void {
  handler.setSyncViewports(callbacks.syncViewports);
  handler.setRefreshOutliner(callbacks.refreshOutliner);
  handler.setShowStatusMessage(callbacks.showStatusMessage);
}

/**
 * Binds CSG action handler callbacks.
 * @param handler CSG action handler.
 * @param callbacks Shared callbacks.
 */
function bindCsgActionCallbacks(
  handler: CsgActionHandler,
  callbacks: ActionHandlerSharedCallbacks
): void {
  handler.setSyncViewports(callbacks.syncViewports);
  handler.setRefreshOutliner(callbacks.refreshOutliner);
  handler.setShowStatus(callbacks.showStatusMessage);
}

/**
 * Creates an alignment handler with a fresh alignment controller.
 * @param commandStack Undo/redo stack.
 * @param selectionManager Shared selection manager.
 * @param gridSnap Grid snap settings.
 * @returns Configured alignment handler.
 */
function createAlignmentHandler(
  commandStack: CommandStack,
  selectionManager: SelectionManager,
  gridSnap: GridSnap
): AlignmentHandler {
  return new AlignmentHandler(
    new AlignmentController(),
    commandStack,
    selectionManager,
    gridSnap
  );
}

/**
 * Binds alignment handler callbacks and optional status bar.
 * @param handler Alignment handler.
 * @param callbacks Shared callbacks including status bar.
 */
function bindAlignmentCallbacks(
  handler: AlignmentHandler,
  callbacks: ActionHandlerSharedCallbacks
): void {
  handler.setSyncViewports(callbacks.syncViewports);
  handler.setOnAxisRestriction(callbacks.onAxisRestrictionChanged);
  if (callbacks.statusBar) {
    handler.setStatusBar(callbacks.statusBar);
  }
}
