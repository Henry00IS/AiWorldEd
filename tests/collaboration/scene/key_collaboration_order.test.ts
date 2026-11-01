import { describe, expect, it } from 'vitest';
import {
  orderCompare,
  orderKeyBetween,
  orderKeyValid,
  orderKeysBetween,
  orderKeysInitial,
} from '@/collaboration/scene/key_collaboration_order.js';
import { keysCollaborationAssign } from '@/collaboration/sync/keys_collaboration_assign.js';

/**
 * Asserts that keys are valid and strictly increasing.
 *
 * @param keys Keys.
 */
function expectAscending(keys: readonly string[]): void {
  keys.forEach((key, index) => {
    expect(orderKeyValid(key)).toBe(true);
    const previous = keys[index - 1];
    if (previous !== undefined) expect(previous < key).toBe(true);
  });
}

/** Fractional sibling order keys that give every client the same order. */
describe('key_collaboration_order', () => {
  it('creates ascending initial keys and keys between neighbours', () => {
    const keys = orderKeysInitial(20);
    expectAscending(keys);
    const middle = orderKeyBetween(keys[3] ?? null, keys[4] ?? null);
    expectAscending([keys[3] ?? '', middle, keys[4] ?? '']);
    expectAscending(orderKeysBetween(keys[0] ?? null, keys[1] ?? null, 10));
  });

  it('keeps splitting the same gap without collisions', () => {
    let low = orderKeyBetween(null, null);
    const high = orderKeyBetween(low, null);
    for (let index = 0; index < 200; index++) {
      const next = orderKeyBetween(low, high);
      expectAscending([low, next, high]);
      low = next;
    }
  });

  it('breaks key ties by node id so order is deterministic', () => {
    expect(orderCompare('k', 'a', 'k', 'b')).toBeLessThan(0);
    expect(orderCompare('k', 'b', 'k', 'a')).toBeGreaterThan(0);
    expect(orderCompare('a', 'z', 'b', 'a')).toBeLessThan(0);
  });

  it('keeps fixed keys, fills new siblings around them and flags violations', () => {
    const [first, second] = orderKeysInitial(2);
    const assigned = keysCollaborationAssign([
      { id: 'new', fixed: false, previousKey: null },
      { id: 'a', fixed: true, previousKey: first ?? null },
      { id: 'b', fixed: true, previousKey: second ?? null },
    ]);
    expect(assigned.keys.get('a')).toBe(first);
    expect(assigned.keys.get('b')).toBe(second);
    expect((assigned.keys.get('new') ?? '') < (first ?? '')).toBe(true);
    expect(assigned.violated).toBe(false);
    const swapped = keysCollaborationAssign([
      { id: 'b', fixed: true, previousKey: second ?? null },
      { id: 'a', fixed: true, previousKey: first ?? null },
    ]);
    expect(swapped.violated).toBe(true);
  });
  it('keeps held keys equal to a concurrent sibling key when the (key, id) order fits', () => {
    const settled = keysCollaborationAssign([
      { id: 'a-mine', fixed: false, previousKey: 'q' },
      { id: 'b-theirs', fixed: true, previousKey: 'q' },
      { id: 'c-theirs', fixed: true, previousKey: 'q' },
    ]);
    expect([...settled.keys.values()]).toEqual(['q', 'q', 'q']);
    expect(settled.violated).toBe(false);
    const between = keysCollaborationAssign([
      { id: 'a-theirs', fixed: true, previousKey: 'q' },
      { id: 'b-mine', fixed: false, previousKey: 'q' },
      { id: 'c-theirs', fixed: true, previousKey: 'q' },
    ]);
    expect(between.keys.get('b-mine')).toBe('q');
    expect(between.violated).toBe(false);
  });

  it('flags a held sibling that cannot fit between two fixed siblings sharing a key', () => {
    const collapsed = keysCollaborationAssign([
      { id: 'a-theirs', fixed: true, previousKey: 'q' },
      { id: 'z-mine', fixed: false, previousKey: 'q' },
      { id: 'b-theirs', fixed: true, previousKey: 'q' },
    ]);
    expect(collapsed.keys.get('z-mine')).toBe('q');
    expect(collapsed.violated).toBe(true);
  });
});
