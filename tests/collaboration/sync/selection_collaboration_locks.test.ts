import { describe, expect, it } from 'vitest';
import {
  selectionCollaborationBlock,
  selectionCollaborationChunks,
} from '@/collaboration/sync/selection_collaboration_locks.js';
import { LockCollaborationTable } from '@/collaboration/sync/lock_collaboration_table.js';

/** Selection to lock translation. */
describe('selection_collaboration_locks', () => {
  it('reports the first object held by another member', () => {
    const locks = new LockCollaborationTable();
    locks.selfSet(1);
    locks.apply(1, ['mine'], []);
    expect(selectionCollaborationBlock(locks, ['mine', 'free'])).toBeNull();
    locks.apply(2, ['theirs'], []);
    expect(selectionCollaborationBlock(locks, ['mine', 'theirs'])).toEqual({ id: 'theirs', holder: 2 });
  });

  it('splits large selections into relay-sized messages', () => {
    const ids = Array.from({ length: 7 }, (_, index) => `n${index}`);
    const chunks = selectionCollaborationChunks(ids, 3);
    expect(chunks.map((chunk) => chunk.length)).toEqual([3, 3, 1]);
    expect(chunks.flat()).toEqual(ids);
    expect(selectionCollaborationChunks(ids, 0)).toHaveLength(ids.length);
  });
});
