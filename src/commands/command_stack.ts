import { UndoCommand } from './undo_command.js';

/**
 * Callback invoked when the command stack state changes.
 * @param undoCount The number of commands available for undo.
 * @param redoCount The number of commands available for redo.
 */
export type CommandStackChangedCallback = (undoCount: number, redoCount: number) => void;

/**
 * Manages the history of undoable commands.
 * Supports undo, redo, and stack size limiting.
 */
export class CommandStack {
  private undoStack: UndoCommand[];
  private redoStack: UndoCommand[];
  private maxSize: number;
  private changedCallbacks: CommandStackChangedCallback[];

  /**
   * Creates a new command stack with a maximum history size.
   * @param maxSize The maximum number of commands to retain in the undo stack.
   */
  constructor(maxSize: number) {
    this.undoStack = [];
    this.redoStack = [];
    this.maxSize = maxSize;
    this.changedCallbacks = [];
  }

  /**
   * Pushes a command onto the undo stack and executes it.
   * Clears the redo stack if there are pending redo operations.
   * Drops the oldest command if the stack exceeds the maximum size.
   * Oldest dropped undo entries are not disposed: their scene effects remain live.
   * @param command The command to push and execute.
   */
  push(command: UndoCommand): void {
    if (this.redoStack.length > 0) {
      this.clearRedoStack();
    }
    command.execute();
    this.undoStack.push(command);
    if (this.undoStack.length > this.maxSize) {
      this.undoStack.shift();
    }
    this.notifyChanged();
  }

  /**
   * Undoes the most recent command.
   * @returns True if a command was undone, false if the stack is empty.
   */
  undo(): boolean {
    if (this.undoStack.length === 0) return false;
    const command = this.undoStack.pop();
    if (command) {
      command.undo();
      this.redoStack.push(command);
      this.notifyChanged();
    }
    return command !== null;
  }

  /**
   * Redoes the most recently undone command.
   * @returns True if a command was redone, false if the redo stack is empty.
   */
  redo(): boolean {
    if (this.redoStack.length === 0) return false;
    const command = this.redoStack.pop();
    if (command) {
      command.execute();
      this.undoStack.push(command);
      this.notifyChanged();
    }
    return command !== null;
  }

  /**
   * Checks whether there are commands available for undo.
   * @returns True if the undo stack contains commands.
   */
  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /**
   * Checks whether there are commands available for redo.
   * @returns True if the redo stack contains commands.
   */
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * Returns the number of commands available for undo.
   * @returns The undo stack length.
   */
  getUndoCount(): number {
    return this.undoStack.length;
  }

  /**
   * Returns the number of commands available for redo.
   * @returns The redo stack length.
   */
  getRedoCount(): number {
    return this.redoStack.length;
  }

  /**
   * Registers a callback to be invoked whenever the stack changes.
   * @param callback The function to call on stack changes.
   */
  onStackChanged(callback: CommandStackChangedCallback): void {
    this.changedCallbacks.push(callback);
  }

  /**
   * Unregisters a previously registered stack change callback.
   * @param callback The function to remove from callbacks.
   */
  offStackChanged(callback: CommandStackChangedCallback): void {
    const index = this.changedCallbacks.indexOf(callback);
    if (index !== -1) {
      this.changedCallbacks.splice(index, 1);
    }
  }

  /**
   * Notifies all registered callbacks of a stack change.
   */
  notifyChanged(): void {
    this.changedCallbacks.forEach((callback) => {
      callback(this.getUndoCount(), this.getRedoCount());
    });
  }

  /**
   * Removes the top undo command if it is the given instance, without undoing it.
   * Used to drop a live-edited color command that ended as a no-op.
   * @param command The command that must be the current top of the undo stack.
   * @returns True when the command was removed.
   */
  discardTopIf(command: UndoCommand): boolean {
    if (this.undoStack.length === 0) return false;
    if (this.undoStack[this.undoStack.length - 1] !== command) return false;
    this.undoStack.pop();
    this.notifyChanged();
    return true;
  }

  /**
   * Returns the command currently at the top of the undo stack.
   * @returns The top command, or null when the stack is empty.
   */
  peekUndo(): UndoCommand | null {
    if (this.undoStack.length === 0) return null;
    return this.undoStack[this.undoStack.length - 1];
  }

  /**
   * Clears all commands from both stacks without undoing them.
   * Disposes redo commands (their effects are already reversed and may hold
   * orphaned GPU resources). Undo entries are dropped without dispose because
   * their scene effects may still be live (or already disposed by a scene load).
   * Does not call undo — used after scene load when history must be abandoned.
   */
  clear(): void {
    this.disposeCommandList(this.redoStack);
    this.undoStack = [];
    this.redoStack = [];
    this.notifyChanged();
  }

  /**
   * Disposes the command stack by releasing orphaned redo resources and callbacks.
   */
  dispose(): void {
    this.disposeCommandList(this.redoStack);
    this.undoStack = [];
    this.redoStack = [];
    this.changedCallbacks = [];
  }

  /**
   * Clears the redo stack and disposes discarded redo commands.
   */
  private clearRedoStack(): void {
    this.disposeCommandList(this.redoStack);
    this.redoStack = [];
  }

  /**
   * Invokes dispose on each command that implements it.
   * @param commands Commands being permanently dropped from history.
   */
  private disposeCommandList(commands: UndoCommand[]): void {
    commands.forEach((command) => {
      if (typeof command.dispose === 'function') {
        command.dispose();
      }
    });
  }
}
