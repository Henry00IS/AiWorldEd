import { describe, expect, it } from 'vitest';
import {
  verifyCollaborationAncestors,
  verifyCollaborationIds,
  verifyCollaborationReason,
  verifyCollaborationVerdict,
} from '@/collaboration/sync/verify_collaboration_verdict.js';

/** Agreed hierarchy: world > a > b > c, world > x > y. */
const PARENTS = new Map([
  ['a', ''],
  ['b', 'a'],
  ['c', 'b'],
  ['x', ''],
  ['y', 'x'],
]);

/**
 * Returns the parent of a node of the test hierarchy.
 *
 * @param id Node id.
 * @returns Parent id, or undefined for unknown nodes.
 */
function parentOf(id: string): string | undefined {
  return PARENTS.get(id);
}

/** The room owner's answer to a relay `verify` query. */
describe('verifyCollaborationVerdict', () => {
  it('confirms true ancestors of any queried id', () => {
    expect(verifyCollaborationVerdict(parentOf, ['c'], ['b', 'a'])).toBe('ok');
    expect(verifyCollaborationVerdict(parentOf, ['c', 'y'], ['a', 'x'])).toBe('ok');
    expect(verifyCollaborationVerdict(parentOf, ['c'], [])).toBe('ok');
  });

  it('refutes ancestors the ids do not have', () => {
    expect(verifyCollaborationVerdict(parentOf, ['c'], ['x'])).toBe('invalid');
    expect(verifyCollaborationVerdict(parentOf, ['c'], ['c'])).toBe('invalid');
    expect(verifyCollaborationVerdict(parentOf, ['b'], ['c'])).toBe('invalid');
  });

  it('reports unknown ids as deleted', () => {
    expect(verifyCollaborationVerdict(parentOf, ['gone'], [])).toBe('deleted');
    expect(verifyCollaborationVerdict(parentOf, ['c'], ['gone'])).toBe('deleted');
  });

  it('collects every ancestor once and survives cycles', () => {
    expect([...verifyCollaborationAncestors(parentOf, ['c', 'b', 'y'])].sort()).toEqual(['a', 'b', 'x']);
    const loop = new Map([
      ['p', 'q'],
      ['q', 'p'],
    ]);
    expect([...verifyCollaborationAncestors((id) => loop.get(id), ['p'])].sort()).toEqual(['p', 'q']);
  });

  it('parses only string id lists', () => {
    expect(verifyCollaborationIds(['a', 'b'])).toEqual(['a', 'b']);
    expect(verifyCollaborationIds(['a', 1])).toBeNull();
    expect(verifyCollaborationIds('a')).toBeNull();
  });

  it('explains every denial in plain words', () => {
    expect(verifyCollaborationReason('owner_timeout')).toContain('did not confirm the containers in time');
    expect(verifyCollaborationReason('owner_left')).toContain('owner left');
    expect(verifyCollaborationReason('deleted')).toContain('deleted');
    expect(verifyCollaborationReason('rate_limited')).toContain('too many');
    expect(verifyCollaborationReason('invalid')).toContain('did not confirm the containers');
  });
});
