import { describe, expect, it } from 'vitest';
import { LockCollaborationTable } from '@/collaboration/sync/lock_collaboration_table.js';

/**
 * Creates a table owned by a given user.
 *
 * @param self Local user id.
 * @returns Lock table.
 */
function tableCreate(self: number): LockCollaborationTable {
  const table = new LockCollaborationTable();
  table.selfSet(self);
  return table;
}

/** Selection lock table: optimistic requests, relay grants and releases. */
describe('lock_collaboration_table', () => {
  it('keeps requests apart from grants: only another member\'s lease blocks', () => {
    const table = tableCreate(1);
    table.requestAdd(['a']);
    expect([...table.requestedIds()]).toEqual(['a']);
    expect(table.heldByOther('a')).toBe(false);
    table.apply(2, ['a'], []);
    expect(table.heldBySelf('a')).toBe(false);
    expect(table.heldByOther('a')).toBe(true);
    expect(table.holder('a')).toBe(2);
  });

  it('releases only the locks of the releasing user', () => {
    const table = tableCreate(1);
    table.apply(2, ['a', 'b'], []);
    table.apply(3, [], ['a']);
    expect(table.holder('a')).toBe(2);
    table.apply(2, [], ['a']);
    expect(table.holder('a')).toBeUndefined();
    expect(table.idsOf(2)).toEqual(['b']);
  });

  it('groups holders by user and clears a departed user', () => {
    const table = tableCreate(1);
    table.apply(2, ['a'], []);
    table.apply(3, ['b', 'c'], []);
    expect(table.byUser().get(3)).toEqual(['b', 'c']);
    table.userClear(3);
    expect(table.idsOf(3)).toEqual([]);
    expect(table.holder('a')).toBe(2);
  });

  it('replaces the requested set and removes deleted requests', () => {
    const table = tableCreate(1);
    table.requestSet(['a', 'b']);
    table.requestSet(['b']);
    expect([...table.requestedIds()]).toEqual(['b']);
    table.requestRemove(['b']);
    expect(table.requestedIds().size).toBe(0);
    table.clear();
    expect(table.byUser().size).toBe(0);
  });
});
