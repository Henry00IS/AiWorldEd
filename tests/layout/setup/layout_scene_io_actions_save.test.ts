import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { CommandStack } from '@/commands/command_stack.js';
import type { UndoCommand } from '@/commands/command_undo.js';
import type { HandlerSceneIo } from '@/tools/io/handler_scene_io.js';
import type { LayoutSceneRefreshContext } from '@/layout/setup/layout_scene_io_actions.js';
import { handleLayoutSceneLoaded, runLayoutSaveScene } from '@/layout/setup/layout_scene_io_actions.js';

/**
 * Creates a no-op undoable command.
 *
 * @returns Command with empty execute and undo.
 */
function createNoopCommand(): UndoCommand {
  return { execute: () => {}, undo: () => {} };
}

/**
 * Creates a scene IO stub whose save resolves with the given result after an
 * optional side effect that runs while the save dialog is open.
 *
 * @param result Value saveScene resolves with.
 * @param whileDialogOpen Runs before the save resolves.
 * @returns Scene IO stub.
 */
function createSceneIoStub(result: boolean, whileDialogOpen: () => void = () => {}): HandlerSceneIo {
  return {
    saveScene: vi.fn(async () => {
      await Promise.resolve();
      whileDialogOpen();
      return result;
    }),
  } as unknown as HandlerSceneIo;
}

/**
 * Builds the minimal refresh context handleLayoutSceneLoaded needs.
 *
 * @param commandStack History to reset.
 * @returns Refresh context with stubbed collaborators.
 */
function createRefreshContext(commandStack: CommandStack): LayoutSceneRefreshContext {
  return {
    selectionManager: { clearSelection: vi.fn() },
    faceModeCoordinator: { getFaceExtrusionController: () => ({ clearFaceSelection: vi.fn() }) },
    commandStack,
    clipPlaneHandler: null,
    worldObject: new THREE.Group(),
    refreshAfterWorldMutation: vi.fn(),
  } as unknown as LayoutSceneRefreshContext;
}

describe('runLayoutSaveScene', () => {
  it('marks the history saved after a successful save', async () => {
    const stack = new CommandStack(8);
    stack.push(createNoopCommand());
    const saved = await runLayoutSaveScene(createSceneIoStub(true), new THREE.Group(), null, stack);
    expect(saved).toBe(true);
    expect(stack.isAtSavedPoint()).toBe(true);
  });

  it('keeps unsaved changes when the save is cancelled or fails', async () => {
    const stack = new CommandStack(8);
    stack.push(createNoopCommand());
    const saved = await runLayoutSaveScene(createSceneIoStub(false), new THREE.Group(), null, stack);
    expect(saved).toBe(false);
    expect(stack.isAtSavedPoint()).toBe(false);
  });

  it('keeps unsaved changes made while the save dialog was open', async () => {
    const stack = new CommandStack(8);
    const sceneIo = createSceneIoStub(true, () => stack.push(createNoopCommand()));
    await runLayoutSaveScene(sceneIo, new THREE.Group(), null, stack);
    expect(stack.isAtSavedPoint()).toBe(false);
  });
});

describe('handleLayoutSceneLoaded saved point', () => {
  it('leaves a freshly loaded or new scene without unsaved changes', () => {
    const stack = new CommandStack(8);
    stack.push(createNoopCommand());
    handleLayoutSceneLoaded(createRefreshContext(stack));
    expect(stack.getUndoCount()).toBe(0);
    expect(stack.isAtSavedPoint()).toBe(true);
  });
});
