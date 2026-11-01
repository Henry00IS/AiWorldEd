import { describe, expect, it } from 'vitest';
import {
  syncCollaborationDeleted,
  syncCollaborationHierarchy,
  syncCollaborationRejection,
} from '@/collaboration/session/session_collaboration_sync.js';
import type { EditOperation } from '@/collaboration/shared/protocol_definitions.js';

/**
 * Pure helpers of the edit sync: deleted ids, hierarchy changes and rejection
 * messages.
 */
describe('session_collaboration_sync helpers', () => {
  it('collects the ids every delete operation removes', () => {
    const ops: EditOperation[] = [
      { k: 'delete', ids: ['a', 'b'] },
      { k: 'transform', ids: ['c'] },
      { k: 'delete', ids: ['d'] },
    ];
    expect(syncCollaborationDeleted(ops)).toEqual(['a', 'b', 'd']);
    expect(syncCollaborationDeleted([{ k: 'transform', ids: ['c'] }])).toEqual([]);
  });

  it('detects operations that change the hierarchy', () => {
    expect(syncCollaborationHierarchy([{ k: 'reparent', ids: ['a'] }])).toBe(true);
    expect(syncCollaborationHierarchy([{ k: 'transform', ids: ['a'] }])).toBe(false);
  });

  it('explains lock conflicts and missing locks in plain words', () => {
    expect(syncCollaborationRejection('lock_conflict')).toContain('another member is editing');
    expect(syncCollaborationRejection('not_locked')).toContain('select the objects');
    expect(syncCollaborationRejection('too_many_ops')).toContain('too many ops');
  });
});
