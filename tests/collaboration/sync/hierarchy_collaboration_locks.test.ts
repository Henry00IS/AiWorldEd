import { describe, expect, it } from 'vitest';
import {
  hierarchyCollaborationBlock,
  hierarchyCollaborationChain,
  hierarchyCollaborationShared,
} from '@/collaboration/sync/hierarchy_collaboration_locks.js';
import { LockCollaborationTable } from '@/collaboration/sync/lock_collaboration_table.js';
import { NODE_PARENT_WORLD } from '@/collaboration/scene/node_collaboration_types.js';

/** Parent map of a small tree: world > a > b > c, world > d. */
const PARENTS: ReadonlyMap<string, string> = new Map([
  ['a', NODE_PARENT_WORLD],
  ['b', 'a'],
  ['c', 'b'],
  ['d', NODE_PARENT_WORLD],
]);

/**
 * Hierarchical lock helpers: parent chains, shared ancestors and blocking
 * holders.
 */
describe('hierarchy_collaboration_locks', () => {
  it('walks the parent chain nearest first without the world', () => {
    expect(hierarchyCollaborationChain((id) => PARENTS.get(id), 'c')).toEqual(['c', 'b', 'a']);
    expect(hierarchyCollaborationChain((id) => PARENTS.get(id), NODE_PARENT_WORLD)).toEqual([]);
  });

  it('stops on cycles in malformed data', () => {
    const cyclic = new Map([
      ['x', 'y'],
      ['y', 'x'],
    ]);
    expect(hierarchyCollaborationChain((id) => cyclic.get(id), 'x')).toEqual(['x', 'y']);
  });

  it('shares every ancestor of an exclusive lock that is not itself exclusive', () => {
    expect(hierarchyCollaborationShared(PARENTS, new Set(['c'])).sort()).toEqual(['a', 'b']);
    expect(hierarchyCollaborationShared(PARENTS, new Set(['b', 'c']))).toEqual(['a']);
    expect(hierarchyCollaborationShared(PARENTS, new Set(['d']))).toEqual([]);
  });

  it('reports the nearest chain node another member holds', () => {
    const table = new LockCollaborationTable();
    table.selfSet(1);
    table.apply(2, ['a'], []);
    table.apply(1, ['b'], []);
    expect(hierarchyCollaborationBlock(table, ['c', 'b', 'a'])).toEqual({ id: 'a', holder: 2 });
    expect(hierarchyCollaborationBlock(table, ['c', 'b'])).toBeNull();
  });
});
