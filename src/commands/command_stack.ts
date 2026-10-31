import { UndoCommand } from './command_undo.js';

/**
 * Callback invoked when the command stack state changes.
 *
 * @param undoCount The number of commands available for undo.
 * @param redoCount The number of commands available for redo.
 */
export type CommandStackChangedCallback = (undoCount: number, redoCount: number) => void;

/**
 * Optional observer that takes over history while attached. Detached (null) by
 * default so standalone editing pays only a null check.
 */
export interface CommandStackObserver {
  /**
   * Receives a command right after it was executed or recorded.
   *
   * @param command The command that changed the scene.
   */
  commandExecuted(command: UndoCommand): void;
  /**
   * Performs an undo step instead of the stack.
   *
   * @returns True when an entry was undone.
   */
  historyUndo(): boolean;
  /**
   * Performs a redo step instead of the stack.
   *
   * @returns True when an entry was redone.
   */
  historyRedo(): boolean;
  /**
   * Returns the number of entries available for undo.
   *
   * @returns Undo entry count.
   */
  historyUndoCount(): number;
  /**
   * Returns the number of entries available for redo.
   *
   * @returns Redo entry count.
   */
  historyRedoCount(): number;
}

/**
 * Manages the history of undoable commands. Supports undo, redo, stack size
 * limiting, and a saved point that reports whether the live scene still matches
 * the last saved or loaded state.
 */
export class CommandStack {
  private undoStack: UndoCommand[];
  private redoStack: UndoCommand[];
  private maxSize: number;
  private changedCallbacks: CommandStackChangedCallback[];
  private savedPointUndoDepth: number | null;
  private historyRevision: number;
  private observer: CommandStackObserver | null;

  /**
   * Creates a new command stack with a maximum history size.
   *
   * @param maxSize The maximum number of commands to retain in the undo stack.
   */
  constructor(maxSize: number) {
    this.undoStack = [];
    this.redoStack = [];
    this.maxSize = maxSize;
    this.changedCallbacks = [];
    this.savedPointUndoDepth = 0;
    this.historyRevision = 0;
    this.observer = null;
  }

  /**
   * Attaches or detaches the history observer.
   *
   * @param observer Observer that takes over history, or null to detach.
   */
  observerSet(observer: CommandStackObserver | null): void {
    this.observer = observer;
  }

  /**
   * Pushes a command onto the undo stack and executes it. Clears the redo stack
   * if there are pending redo operations. Drops the oldest command if the stack
   * exceeds the maximum size. Oldest dropped undo entries are not disposed:
   * their scene effects remain live.
   *
   * @param command The command to push and execute.
   */
  push(command: UndoCommand): void {
    this.discardRedoBranch();
    command.execute();
    this.undoStackAppendNewCommand(command);
  }

  /**
   * Records a command that already ran execute() successfully. Used when the
   * caller must validate success before committing history.
   *
   * @param command Already-executed undoable command.
   */
  recordExecuted(command: UndoCommand): void {
    this.discardRedoBranch();
    this.undoStackAppendNewCommand(command);
  }

  /**
   * Undoes the most recent command.
   *
   * @returns True if a command was undone, false if the stack is empty.
   */
  undo(): boolean {
    if (this.observer !== null) return this.observer.historyUndo();
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
   *
   * @returns True if a command was redone, false if the redo stack is empty.
   */
  redo(): boolean {
    if (this.observer !== null) return this.observer.historyRedo();
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
   *
   * @returns True if the undo stack contains commands.
   */
  canUndo(): boolean {
    if (this.observer !== null) return this.observer.historyUndoCount() > 0;
    return this.undoStack.length > 0;
  }

  /**
   * Checks whether there are commands available for redo.
   *
   * @returns True if the redo stack contains commands.
   */
  canRedo(): boolean {
    if (this.observer !== null) return this.observer.historyRedoCount() > 0;
    return this.redoStack.length > 0;
  }

  /**
   * Returns the number of commands available for undo.
   *
   * @returns The undo stack length.
   */
  getUndoCount(): number {
    if (this.observer !== null) return this.observer.historyUndoCount();
    return this.undoStack.length;
  }

  /**
   * Returns the number of commands available for redo.
   *
   * @returns The redo stack length.
   */
  getRedoCount(): number {
    if (this.observer !== null) return this.observer.historyRedoCount();
    return this.redoStack.length;
  }

  /**
   * Registers a callback to be invoked whenever the stack changes.
   *
   * @param callback The function to call on stack changes.
   */
  onStackChanged(callback: CommandStackChangedCallback): void {
    this.changedCallbacks.push(callback);
  }

  /**
   * Unregisters a previously registered stack change callback.
   *
   * @param callback The function to remove from callbacks.
   */
  offStackChanged(callback: CommandStackChangedCallback): void {
    const index = this.changedCallbacks.indexOf(callback);
    if (index !== -1) {
      this.changedCallbacks.splice(index, 1);
    }
  }

  /**
   * Marks the current undo position as the saved point, so the stack reports no
   * unsaved changes until history moves away from it.
   */
  markSavedPoint(): void {
    this.savedPointUndoDepth = this.undoStack.length;
  }

  /**
   * Returns whether the live history sits exactly on the saved point. False
   * once the saved state can no longer be reached by undo or redo.
   *
   * @returns True when there are no unsaved changes.
   */
  isAtSavedPoint(): boolean {
    return this.savedPointUndoDepth === this.undoStack.length;
  }

  /**
   * Returns a counter that increases on every stack change notification, so
   * callers can detect edits made while an asynchronous save was running.
   *
   * @returns Current history revision.
   */
  getHistoryRevision(): number {
    return this.historyRevision;
  }

  /** Notifies all registered callbacks of a stack change. */
  notifyChanged(): void {
    this.historyRevision += 1;
    this.changedCallbacks.forEach((callback) => {
      callback(this.getUndoCount(), this.getRedoCount());
    });
  }

  /**
   * Removes the top undo command if it is the given instance, without undoing
   * it. Used to drop a live-edited color command that ended as a no-op.
   *
   * @param command The command that must be the current top of the undo stack.
   * @returns True when the command was removed.
   */
  discardTopIf(command: UndoCommand): boolean {
    if (this.undoStack.length === 0) return false;
    if (this.undoStack[this.undoStack.length - 1] !== command) return false;
    this.savedPointRebaseAfterTopDiscarded();
    this.undoStack.pop();
    this.notifyChanged();
    return true;
  }

  /**
   * Returns the command currently at the top of the undo stack.
   *
   * @returns The top command, or null when the stack is empty.
   */
  peekUndo(): UndoCommand | null {
    if (this.undoStack.length === 0) return null;
    return this.undoStack[this.undoStack.length - 1] ?? null;
  }

  /**
   * Clears all commands from both stacks without undoing them. Disposes redo
   * commands (their effects are already reversed and may hold orphaned GPU
   * resources). Undo entries are dropped without dispose because their scene
   * effects may still be live (or already disposed by a scene load). Does not
   * call undo — used after scene load when history must be abandoned. The saved
   * point becomes unreachable until {@link markSavedPoint} is called.
   */
  clear(): void {
    this.disposeCommandList(this.redoStack);
    this.undoStack = [];
    this.redoStack = [];
    this.savedPointUndoDepth = null;
    this.notifyChanged();
  }

  /**
   * Disposes the command stack by releasing orphaned redo resources and
   * callbacks.
   */
  dispose(): void {
    this.disposeCommandList(this.redoStack);
    this.undoStack = [];
    this.redoStack = [];
    this.changedCallbacks = [];
  }

  /**
   * Discards pending redo entries before a new command enters history, and
   * forgets a saved point that only that redo branch could reach.
   */
  private discardRedoBranch(): void {
    if (this.redoStack.length > 0) {
      this.savedPointForgetIfInRedoBranch();
      this.clearRedoStack();
    }
  }

  /**
   * Appends a command that already ran to the undo stack, drops the oldest
   * entry past the size limit, and notifies.
   *
   * @param command Executed command to record.
   */
  private undoStackAppendNewCommand(command: UndoCommand): void {
    this.undoStack.push(command);
    if (this.undoStack.length > this.maxSize) {
      this.undoStack.shift();
      this.savedPointRebaseAfterOldestDropped();
    }
    this.notifyChanged();
    if (this.observer !== null) this.observer.commandExecuted(command);
  }

  /** Forgets a saved point that lies in the redo branch about to be discarded. */
  private savedPointForgetIfInRedoBranch(): void {
    if (this.savedPointUndoDepth !== null && this.savedPointUndoDepth > this.undoStack.length) {
      this.savedPointUndoDepth = null;
    }
  }

  /**
   * Moves the saved point down one entry after the oldest undo entry was
   * dropped. A saved point taken before that entry became unreachable.
   */
  private savedPointRebaseAfterOldestDropped(): void {
    if (this.savedPointUndoDepth === null) {
      return;
    }
    this.savedPointUndoDepth = this.savedPointUndoDepth > 0 ? this.savedPointUndoDepth - 1 : null;
  }

  /**
   * Moves the saved point down one entry when it includes the no-op top undo
   * entry that is about to be discarded, or lies in the redo branch above it.
   */
  private savedPointRebaseAfterTopDiscarded(): void {
    if (this.savedPointUndoDepth !== null && this.savedPointUndoDepth >= this.undoStack.length) {
      this.savedPointUndoDepth -= 1;
    }
  }

  /** Clears the redo stack and disposes discarded redo commands. */
  private clearRedoStack(): void {
    this.disposeCommandList(this.redoStack);
    this.redoStack = [];
  }

  /**
   * Invokes dispose on each command that implements it.
   *
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
