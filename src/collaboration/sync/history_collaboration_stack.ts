import type { TrackerCollaborationChange } from '@/collaboration/sync/tracker_collaboration_commit.js';

/** One undoable step of the local user: the node changes of one commit. */
export interface HistoryCollaborationEntry {
  changes: TrackerCollaborationChange[];
}

/** Default number of steps kept per direction. */
export const HISTORY_COLLABORATION_LIMIT = 200;

/**
 * Per-user undo and redo stacks for a collaboration room. Entries only ever
 * contain the local user's own committed changes.
 */
export class HistoryCollaborationStack {
  private readonly undoEntries: HistoryCollaborationEntry[];
  private readonly redoEntries: HistoryCollaborationEntry[];
  private readonly limit: number;

  /**
   * Creates empty stacks.
   *
   * @param limit Maximum entries per stack.
   */
  constructor(limit: number = HISTORY_COLLABORATION_LIMIT) {
    this.undoEntries = [];
    this.redoEntries = [];
    this.limit = limit;
  }

  /**
   * Records a new local step and clears the redo stack.
   *
   * @param entry Committed changes.
   */
  record(entry: HistoryCollaborationEntry): void {
    if (entry.changes.length === 0) return;
    this.undoEntries.push(entry);
    if (this.undoEntries.length > this.limit) this.undoEntries.shift();
    this.redoEntries.length = 0;
  }

  /**
   * Returns the next entry to undo or redo without removing it.
   *
   * @param redo True for the redo stack.
   * @returns Entry, or undefined when empty.
   */
  peek(redo: boolean): HistoryCollaborationEntry | undefined {
    const stack = redo ? this.redoEntries : this.undoEntries;
    return stack[stack.length - 1];
  }

  /**
   * Moves the top entry to the opposite stack after it was applied.
   *
   * @param redo True when a redo was applied.
   */
  shift(redo: boolean): void {
    const from = redo ? this.redoEntries : this.undoEntries;
    const to = redo ? this.undoEntries : this.redoEntries;
    const entry = from.pop();
    if (entry !== undefined) to.push(entry);
  }

  /**
   * Removes an entry from both stacks (for example after the relay rejected
   * it).
   *
   * @param entry Entry to forget.
   */
  drop(entry: HistoryCollaborationEntry): void {
    [this.undoEntries, this.redoEntries].forEach((stack) => {
      const index = stack.indexOf(entry);
      if (index >= 0) stack.splice(index, 1);
    });
  }

  /**
   * Returns the number of entries on a stack.
   *
   * @param redo True for the redo stack.
   * @returns Entry count.
   */
  count(redo: boolean): number {
    return redo ? this.redoEntries.length : this.undoEntries.length;
  }

  /** Forgets every entry. */
  clear(): void {
    this.undoEntries.length = 0;
    this.redoEntries.length = 0;
  }
}
