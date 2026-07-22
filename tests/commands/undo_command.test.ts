import { describe, it, expect } from 'vitest';
import { UndoCommand } from '../../src/commands/undo_command.js';

/**
 * A simple concrete implementation of UndoCommand for testing.
 * Stores a mutable value that can be toggled by execute/undo.
 */
class ToggleCommand implements UndoCommand {
  private value: number;
  private target: number;

  constructor(value: number, target: number) {
    this.value = value;
    this.target = target;
  }

  execute(): void {
    this.value = this.target;
  }

  undo(): void {
    this.value = this.target === 0 ? 1 : 0;
  }

  getValue(): number {
    return this.value;
  }
}

describe('UndoCommand interface', () => {
  it('should define execute and undo methods', () => {
    const command: UndoCommand = {
      execute: () => {},
      undo: () => {}
    };
    expect(typeof command.execute).toBe('function');
    expect(typeof command.undo).toBe('function');
  });

  it('should allow concrete implementations to round-trip', () => {
    const command = new ToggleCommand(1, 0);
    expect(command.getValue()).toBe(1);
    command.execute();
    expect(command.getValue()).toBe(0);
    command.undo();
    expect(command.getValue()).toBe(1);
  });

  it('should support repeated execute and undo calls', () => {
    const command = new ToggleCommand(1, 0);
    command.execute();
    expect(command.getValue()).toBe(0);
    command.undo();
    expect(command.getValue()).toBe(1);
    command.execute();
    expect(command.getValue()).toBe(0);
    command.undo();
    expect(command.getValue()).toBe(1);
  });
});
