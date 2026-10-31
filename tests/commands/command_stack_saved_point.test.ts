import { describe, it, expect } from 'vitest';
import type { UndoCommand } from '@/commands/command_undo.js';
import { CommandStack } from '@/commands/command_stack.js';

/**
 * Creates a no-op undoable command for history position tests.
 *
 * @returns Command with empty execute and undo.
 */
function createNoopCommand(): UndoCommand {
  return { execute: () => {}, undo: () => {} };
}

/**
 * Pushes the given number of no-op commands.
 *
 * @param stack Stack to push onto.
 * @param count Number of commands to push.
 */
function pushCommands(stack: CommandStack, count: number): void {
  for (let index = 0; index < count; index++) {
    stack.push(createNoopCommand());
  }
}

describe('CommandStack saved point', () => {
  it('starts at the saved point so a fresh editor has no unsaved changes', () => {
    expect(new CommandStack(8).isAtSavedPoint()).toBe(true);
  });

  it('leaves the saved point after push and after recordExecuted', () => {
    const pushed = new CommandStack(8);
    pushed.push(createNoopCommand());
    expect(pushed.isAtSavedPoint()).toBe(false);
    const recorded = new CommandStack(8);
    recorded.recordExecuted(createNoopCommand());
    expect(recorded.isAtSavedPoint()).toBe(false);
  });

  it('returns to the saved point when undo walks back to it and leaves it again on redo', () => {
    const stack = new CommandStack(8);
    pushCommands(stack, 2);
    stack.undo();
    expect(stack.isAtSavedPoint()).toBe(false);
    stack.undo();
    expect(stack.isAtSavedPoint()).toBe(true);
    stack.redo();
    expect(stack.isAtSavedPoint()).toBe(false);
  });

  it('marks the current position as saved and treats undo past it as unsaved', () => {
    const stack = new CommandStack(8);
    pushCommands(stack, 2);
    stack.markSavedPoint();
    expect(stack.isAtSavedPoint()).toBe(true);
    stack.undo();
    expect(stack.isAtSavedPoint()).toBe(false);
    stack.redo();
    expect(stack.isAtSavedPoint()).toBe(true);
  });

  it('keeps the saved point reachable by redo after undoing below it', () => {
    const stack = new CommandStack(8);
    pushCommands(stack, 2);
    stack.markSavedPoint();
    stack.undo();
    stack.undo();
    stack.redo();
    stack.redo();
    expect(stack.isAtSavedPoint()).toBe(true);
  });

  it('forgets a saved point in a redo branch that a new command discards', () => {
    const stack = new CommandStack(8);
    pushCommands(stack, 2);
    stack.markSavedPoint();
    stack.undo();
    stack.push(createNoopCommand());
    expect(stack.isAtSavedPoint()).toBe(false);
    stack.undo();
    expect(stack.isAtSavedPoint()).toBe(false);
  });

  it('keeps a saved point at the branch point when a new command discards redo above it', () => {
    const stack = new CommandStack(8);
    pushCommands(stack, 1);
    stack.markSavedPoint();
    pushCommands(stack, 1);
    stack.undo();
    stack.push(createNoopCommand());
    stack.undo();
    expect(stack.isAtSavedPoint()).toBe(true);
  });

  it('follows the saved point down when the oldest entry overflows the size limit', () => {
    const stack = new CommandStack(2);
    pushCommands(stack, 1);
    stack.markSavedPoint();
    pushCommands(stack, 2);
    expect(stack.getUndoCount()).toBe(2);
    stack.undo();
    stack.undo();
    expect(stack.isAtSavedPoint()).toBe(true);
  });

  it('makes the saved point unreachable when overflow drops the entry it was taken before', () => {
    const stack = new CommandStack(2);
    pushCommands(stack, 3);
    stack.undo();
    stack.undo();
    expect(stack.getUndoCount()).toBe(0);
    expect(stack.isAtSavedPoint()).toBe(false);
  });

  it('returns to the saved point when a no-op top command is discarded', () => {
    const stack = new CommandStack(8);
    const noop = createNoopCommand();
    stack.push(noop);
    expect(stack.discardTopIf(noop)).toBe(true);
    expect(stack.isAtSavedPoint()).toBe(true);
  });

  it('keeps a saved point that included the discarded no-op top command', () => {
    const stack = new CommandStack(8);
    const noop = createNoopCommand();
    pushCommands(stack, 1);
    stack.push(noop);
    stack.markSavedPoint();
    stack.discardTopIf(noop);
    expect(stack.isAtSavedPoint()).toBe(true);
    stack.undo();
    expect(stack.isAtSavedPoint()).toBe(false);
  });

  it('treats the history as unsaved after clear until a new saved point is marked', () => {
    const stack = new CommandStack(8);
    stack.clear();
    expect(stack.isAtSavedPoint()).toBe(false);
    stack.markSavedPoint();
    expect(stack.isAtSavedPoint()).toBe(true);
  });

  it('increases the history revision on every stack change', () => {
    const stack = new CommandStack(8);
    const start = stack.getHistoryRevision();
    pushCommands(stack, 1);
    stack.undo();
    stack.redo();
    expect(stack.getHistoryRevision()).toBe(start + 3);
    stack.markSavedPoint();
    expect(stack.getHistoryRevision()).toBe(start + 3);
  });
});
