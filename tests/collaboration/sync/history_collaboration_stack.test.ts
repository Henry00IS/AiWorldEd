import { describe, expect, it, vi } from 'vitest';
import {
  HistoryCollaborationStack,
  type HistoryCollaborationEntry,
} from '@/collaboration/sync/history_collaboration_stack.js';
import type { TrackerCollaborationChange } from '@/collaboration/sync/tracker_collaboration_commit.js';

/**
 * Creates a history entry with a given number of placeholder changes.
 *
 * @param count Change count.
 * @returns Entry.
 */
function entryCreate(count: number): HistoryCollaborationEntry {
  const changes = Array.from({ length: count }, () => ({}) as TrackerCollaborationChange);
  return { changes };
}

/** Per-user undo and redo stacks. */
describe('history_collaboration_stack', () => {
  it('ignores empty entries and clears redo on a new record', () => {
    const stack = new HistoryCollaborationStack();
    stack.record(entryCreate(0));
    expect(stack.count(false)).toBe(0);
    stack.record(entryCreate(1));
    stack.shift(false);
    expect(stack.count(true)).toBe(1);
    stack.record(entryCreate(1));
    expect(stack.count(true)).toBe(0);
  });

  it('moves entries between undo and redo', () => {
    const stack = new HistoryCollaborationStack();
    const entry = entryCreate(1);
    stack.record(entry);
    stack.shift(false);
    expect(stack.peek(true)).toBe(entry);
    stack.shift(true);
    expect(stack.peek(false)).toBe(entry);
  });

  it('caps the undo depth and drops a skipped entry', () => {
    const limit = 3;
    const stack = new HistoryCollaborationStack(limit);
    const entries = Array.from({ length: limit + 2 }, () => entryCreate(1));
    entries.forEach((entry) => stack.record(entry));
    expect(stack.count(false)).toBe(limit);
    stack.drop(entries[entries.length - 1] ?? entryCreate(1));
    expect(stack.count(false)).toBe(limit - 1);
    stack.clear();
    expect(stack.peek(false)).toBeUndefined();
  });

  it('reports every change so undo counters refresh', () => {
    const changed = vi.fn();
    const stack = new HistoryCollaborationStack(10, changed);
    const entry = entryCreate(1);
    stack.record(entry);
    stack.shift(false);
    stack.shift(true);
    stack.drop(entry);
    stack.drop(entry);
    stack.shift(false);
    stack.clear();
    expect(changed).toHaveBeenCalledTimes(5);
  });
});
