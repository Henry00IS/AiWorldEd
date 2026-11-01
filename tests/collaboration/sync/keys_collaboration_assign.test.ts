import { describe, expect, it } from 'vitest';
import { orderKeysBetween } from '@/collaboration/scene/key_collaboration_order.js';
import {
  keysCollaborationAssign,
  type KeysCollaborationSibling,
} from '@/collaboration/sync/keys_collaboration_assign.js';

/**
 * Builds held siblings with ascending agreed keys.
 *
 * @param count Number of siblings.
 * @returns Siblings in agreed order.
 */
function siblingsBuild(count: number): KeysCollaborationSibling[] {
  const keys = orderKeysBetween(null, null, count);
  return keys.map((key, index) => ({ id: `node-${index}`, fixed: false, previousKey: key }));
}

/**
 * Counts siblings whose key changed.
 *
 * @param siblings Siblings with their previous keys.
 * @param keys Assigned keys.
 * @returns Number of re-keyed siblings.
 */
function rekeyedCount(siblings: readonly KeysCollaborationSibling[], keys: Map<string, string>): number {
  return siblings.filter((sibling) => keys.get(sibling.id) !== sibling.previousKey).length;
}

describe('keysCollaborationAssign', () => {
  it.each(['first', 'last'])('moving one of many siblings to %s re-keys only that sibling', (end) => {
    const siblings = siblingsBuild(40 + Math.floor(Math.random() * 40));
    const movedIndex = 5 + Math.floor(Math.random() * (siblings.length - 10));
    const moved = siblings.splice(movedIndex, 1);
    const reordered = end === 'first' ? [...moved, ...siblings] : [...siblings, ...moved];
    const assignment = keysCollaborationAssign(reordered);
    expect(rekeyedCount(reordered, assignment.keys)).toBe(1);
    const assigned = reordered.map((sibling) => assignment.keys.get(sibling.id) ?? '');
    expect(assigned).toEqual([...assigned].sort());
  });
});
