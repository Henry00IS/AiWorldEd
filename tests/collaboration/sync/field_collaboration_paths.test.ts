import { describe, expect, it } from 'vitest';
import type { NodeCollaborationState } from '@/collaboration/scene/node_collaboration_types.js';
import {
  FIELD_COLLABORATION_PATHS_MAXIMUM,
  fieldCollaborationDiff,
  fieldCollaborationMerge,
  fieldCollaborationParse,
} from '@/collaboration/sync/field_collaboration_paths.js';

/**
 * Builds a node state for tests.
 *
 * @param value Fields.
 * @returns State.
 */
function state(value: Record<string, unknown>): NodeCollaborationState {
  return { id: 'n', kind: 'brush', ...value } as unknown as NodeCollaborationState;
}

/** Field paths: diff, strict parse and last-writer-wins merge. */
describe('field_collaboration_paths', () => {
  it('names changed fields down to the depth limit and treats arrays as leaves', () => {
    const before = state({ parent: 'a', data: { entry: { name: 'x', tint: [1, 2] } } });
    const after = state({ parent: 'b', data: { entry: { name: 'x', tint: [1, 3] } } });
    expect(fieldCollaborationDiff(before, after)).toEqual(['parent', 'data.entry.tint']);
    expect(fieldCollaborationDiff(before, before)).toEqual([]);
  });

  it('gives up (whole state) when too many fields change', () => {
    const many = Object.fromEntries(
      Array.from({ length: FIELD_COLLABORATION_PATHS_MAXIMUM + 1 }, (_, i) => [`f${i}`, i]),
    );
    expect(fieldCollaborationDiff(state({}), state(many))).toBeNull();
  });

  it('rejects malformed or dangerous paths from the wire', () => {
    expect(fieldCollaborationParse(['data.entry.name'])).toEqual(['data.entry.name']);
    expect(fieldCollaborationParse([])).toBeNull();
    expect(fieldCollaborationParse(['id'])).toBeNull();
    expect(fieldCollaborationParse(['__proto__.polluted'])).toBeNull();
    expect(fieldCollaborationParse(['a..b'])).toBeNull();
    expect(fieldCollaborationParse(['a.b.c.d.e'])).toBeNull();
    expect(fieldCollaborationParse([1])).toBeNull();
    expect(fieldCollaborationParse('parent')).toBeNull();
  });

  it('merges only the named fields so concurrent edits of other fields survive', () => {
    const base = state({ parent: 'a', data: { entry: { name: 'mine', tint: [0] }, brush: { planes: [1] } } });
    const remote = state({ parent: 'b', data: { entry: { name: 'theirs', tint: [9] }, brush: { planes: [2] } } });
    const merged = fieldCollaborationMerge(base, remote, ['data.entry.tint']) as unknown as Record<string, any>;
    expect(merged['parent']).toBe('a');
    expect(merged['data'].entry).toEqual({ name: 'mine', tint: [9] });
    expect(merged['data'].brush).toBe((base as unknown as Record<string, any>)['data'].brush);
    expect((base as unknown as Record<string, any>)['data'].entry.tint).toEqual([0]);
    expect(merged['data'].entry.tint).not.toBe((remote as unknown as Record<string, any>)['data'].entry.tint);
  });

  it('deletes a field the source no longer has', () => {
    const merged = fieldCollaborationMerge(state({ extra: 1 }), state({}), ['extra']) as unknown as Record<
      string,
      unknown
    >;
    expect('extra' in merged).toBe(false);
  });
});
