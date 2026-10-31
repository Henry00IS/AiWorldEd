import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CommandStack } from '@/commands/command_stack.js';
import type { UndoCommand } from '@/commands/command_undo.js';
import {
  applyLayoutHistoryChange,
  buildLayoutHistoryChangeStatusMessage,
  type LayoutHistoryChangeContext,
} from '@/layout/setup/layout_scene_io_actions.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import type { CoordinatorFaceMode } from '@/tools/face/coordinator_face_mode.js';
import type { ControllerSnapSettings } from '@/tools/snap/controller_snap_settings.js';
import type { PanelProperties } from '@/ui/properties/panel_properties.js';

describe('applyLayoutHistoryChange status feedback', () => {
  it('reports Undo after undoing a command', () => {
    const { context, statusMessages } = createHistoryContext();
    context.commandStack.push(createNoOpCommand());
    applyLayoutHistoryChange(context, 'undo');
    expect(statusMessages).toEqual(['Undo']);
  });

  it('reports Redo after redoing a command', () => {
    const { context, statusMessages } = createHistoryContext();
    context.commandStack.push(createNoOpCommand());
    applyLayoutHistoryChange(context, 'undo');
    applyLayoutHistoryChange(context, 'redo');
    expect(statusMessages).toEqual(['Undo', 'Redo']);
  });

  it('reports when there is nothing to undo or redo', () => {
    const { context, statusMessages } = createHistoryContext();
    applyLayoutHistoryChange(context, 'undo');
    applyLayoutHistoryChange(context, 'redo');
    expect(statusMessages).toEqual(['Nothing to undo', 'Nothing to redo']);
  });

  it('writes the status message after the world refresh so it is the latest text', () => {
    const order: string[] = [];
    const { context } = createHistoryContext();
    context.refreshAfterWorldMutation = () => order.push('refresh');
    context.showStatusMessage = (message) => order.push(message);
    context.commandStack.push(createNoOpCommand());
    applyLayoutHistoryChange(context, 'undo');
    expect(order).toEqual(['refresh', 'Undo']);
  });

  it('builds a distinct message for every direction and outcome', () => {
    const messages = new Set([
      buildLayoutHistoryChangeStatusMessage('undo', true),
      buildLayoutHistoryChangeStatusMessage('undo', false),
      buildLayoutHistoryChangeStatusMessage('redo', true),
      buildLayoutHistoryChangeStatusMessage('redo', false),
    ]);
    expect(messages.size).toBe(4);
  });
});

/**
 * Builds a history change context with stub collaborators that record status
 * messages.
 *
 * @returns The context and the array receiving every status message.
 */
function createHistoryContext(): { context: LayoutHistoryChangeContext; statusMessages: string[] } {
  const statusMessages: string[] = [];
  const faceExtrusionController = { pruneInvalidFaceSelection: () => {} };
  const context: LayoutHistoryChangeContext = {
    selectionManager: new ManagerSelection(),
    faceModeCoordinator: {
      getFaceExtrusionController: () => faceExtrusionController,
    } as unknown as CoordinatorFaceMode,
    commandStack: new CommandStack(16),
    clipPlaneHandler: null,
    snapSettingsController: { rebakeWorldTexturesIfLocked: () => {} } as unknown as ControllerSnapSettings,
    worldObject: new THREE.Group(),
    propertiesPanel: {} as unknown as PanelProperties,
    refreshAfterWorldMutation: () => {},
    showStatusMessage: (message) => statusMessages.push(message),
  };
  return { context, statusMessages };
}

/**
 * Builds an undoable command that changes nothing.
 *
 * @returns No-op undo command.
 */
function createNoOpCommand(): UndoCommand {
  return { execute: () => {}, undo: () => {} };
}
