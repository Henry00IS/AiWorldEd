import * as THREE from 'three';
import { CommandStack } from '@/commands/command_stack.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { HandlerObjectAction } from '@/outliner/hierarchy/handler_object_action.js';
import { HandlerCsgAction } from '@/tools/csg/handler_csg_action.js';
import { HandlerAlignment } from '@/outliner/alignment/handler_alignment.js';
import { ControllerAlignment } from '@/outliner/alignment/controller_alignment.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { StatusBar } from '@/ui/status/status_bar.js';
import { AlignmentAxis } from '@/types/alignment_axis.js';

/** Callbacks shared by object, CSG, and alignment action handlers. */
export interface ActionHandlerSharedCallbacks {
  syncViewports: () => void;
  /**
   * Refreshes solid CSG and overlays after object poses are committed.
   *
   * @param objects Objects whose transforms were committed.
   */
  afterTransformCommit: (objects: readonly THREE.Object3D[]) => void;
  refreshOutliner: () => void;
  /**
   * Copies outliner expand/collapse from a duplicated source root onto its
   * clone so closed groups stay closed.
   *
   * @param sourceRoot Source hierarchy root.
   * @param cloneRoot Clone hierarchy root.
   */
  mirrorExpandState: (sourceRoot: THREE.Object3D, cloneRoot: THREE.Object3D) => void;
  showStatusMessage: (message: string) => void;
  onAxisRestrictionChanged: (axis: AlignmentAxis) => void;
  statusBar: StatusBar | null;
}

/**
 * Creates and wires object, CSG, and alignment action handlers.
 *
 * @param worldObject Root scene hierarchy group.
 * @param commandStack Undo/redo stack.
 * @param selectionManager Shared selection manager.
 * @param gridSnap Grid snap settings.
 * @param callbacks Shared viewport/outliner/status callbacks.
 * @returns Wired object, CSG, and alignment handlers.
 */
export function createWiredActionHandlers(
  worldObject: THREE.Group,
  commandStack: CommandStack,
  selectionManager: ManagerSelection,
  gridSnap: GridSnap,
  callbacks: ActionHandlerSharedCallbacks,
): {
  objectActionHandler: HandlerObjectAction;
  csgActionHandler: HandlerCsgAction;
  alignmentHandler: HandlerAlignment;
} {
  const objectActionHandler = new HandlerObjectAction(worldObject, commandStack, selectionManager);
  bindObjectActionCallbacks(objectActionHandler, callbacks);
  const csgActionHandler = new HandlerCsgAction(worldObject, commandStack, selectionManager);
  bindCsgActionCallbacks(csgActionHandler, callbacks);
  const alignmentHandler = createAlignmentHandler(commandStack, selectionManager, gridSnap);
  bindAlignmentCallbacks(alignmentHandler, callbacks);
  return { objectActionHandler, csgActionHandler, alignmentHandler };
}

/**
 * Binds object-action handler callbacks.
 *
 * @param handler Object action handler.
 * @param callbacks Shared callbacks.
 */
function bindObjectActionCallbacks(handler: HandlerObjectAction, callbacks: ActionHandlerSharedCallbacks): void {
  handler.setSyncViewports(callbacks.syncViewports);
  handler.setRefreshOutliner(callbacks.refreshOutliner);
  handler.setMirrorExpandState(callbacks.mirrorExpandState);
  handler.setShowStatusMessage(callbacks.showStatusMessage);
}

/**
 * Binds CSG action handler callbacks.
 *
 * @param handler CSG action handler.
 * @param callbacks Shared callbacks.
 */
function bindCsgActionCallbacks(handler: HandlerCsgAction, callbacks: ActionHandlerSharedCallbacks): void {
  handler.setSyncViewports(callbacks.syncViewports);
  handler.setRefreshOutliner(callbacks.refreshOutliner);
  handler.setShowStatus(callbacks.showStatusMessage);
}

/**
 * Creates an alignment handler with a fresh alignment controller.
 *
 * @param commandStack Undo/redo stack.
 * @param selectionManager Shared selection manager.
 * @param gridSnap Grid snap settings.
 * @returns Configured alignment handler.
 */
function createAlignmentHandler(
  commandStack: CommandStack,
  selectionManager: ManagerSelection,
  gridSnap: GridSnap,
): HandlerAlignment {
  return new HandlerAlignment(new ControllerAlignment(), commandStack, selectionManager, gridSnap);
}

/**
 * Binds alignment handler callbacks and optional status bar.
 *
 * @param handler Alignment handler.
 * @param callbacks Shared callbacks including status bar.
 */
function bindAlignmentCallbacks(handler: HandlerAlignment, callbacks: ActionHandlerSharedCallbacks): void {
  handler.setAfterTransformCommit(callbacks.afterTransformCommit);
  handler.setOnAxisRestriction(callbacks.onAxisRestrictionChanged);
  if (callbacks.statusBar) {
    handler.setStatusBar(callbacks.statusBar);
  }
}
