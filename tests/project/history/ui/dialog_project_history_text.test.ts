import { describe, expect, it } from 'vitest';
import { projectHistoryIndexCreate } from '@/project/history/tree/project_history_tree.js';
import {
  projectHistoryTreeAutosave,
  projectHistoryTreeSnapshot,
} from '@/project/history/tree/project_history_tree_edit.js';
import { PROJECT_HISTORY_HERE } from '@/project/history/tree/project_history_tree_layout.js';
import { dialogProjectHistoryKeyTarget } from '@/project/history/ui/dialog_project_history_keys.js';
import {
  dialogProjectHistoryChange,
  dialogProjectHistoryDay,
  dialogProjectHistoryIntro,
  dialogProjectHistoryNodeName,
  dialogProjectHistorySummary,
} from '@/project/history/ui/dialog_project_history_text.js';
import type { DialogProjectHistoryTree } from '@/project/history/ui/dialog_project_history_types.js';

/**
 * Builds a tree with a snapshot, a session on it and a branch.
 *
 * @returns Shown tree and the node ids.
 */
function fixture() {
  const index = projectHistoryIndexCreate('level', 'a.aiworld');
  const a = projectHistoryTreeSnapshot(index, 0, 4, 'Gate');
  const b = projectHistoryTreeAutosave(index, 60_000, 6).node;
  const tree: DialogProjectHistoryTree = { id: 'l', kind: 'level', label: 'a', index, current: true, pending: false };
  return { tree, index, a, b, ids: [PROJECT_HISTORY_HERE, b.id, a.id] };
}

describe('project history dialog text and keys', () => {
  it('names states and describes their change against the state they grew from', () => {
    const { index, a, b } = fixture();
    expect(dialogProjectHistoryNodeName(a)).toBe('Gate');
    expect(dialogProjectHistoryNodeName(b)).toBe('Editing Session');
    expect(dialogProjectHistoryChange(index, a)).toBe('First saved state');
    expect(dialogProjectHistoryChange(index, b)).toBe('+2 objects');
    expect(dialogProjectHistorySummary([index])).toBe('1 history \u00b7 2 saved states \u00b7 1 named snapshot');
    expect(dialogProjectHistoryIntro('Castle')).toMatch(
      /^Every autosave and snapshot kept in project \u201cCastle\u201d\./,
    );
    expect(dialogProjectHistoryDay(Date.now(), Date.now())).toBe('Today');
  });

  it('moves through rows and along branches with the arrow keys', () => {
    const { tree, a, b, ids } = fixture();
    expect(dialogProjectHistoryKeyTarget('ArrowDown', tree, ids, PROJECT_HISTORY_HERE)).toEqual({
      kind: 'select',
      id: b.id,
    });
    expect(dialogProjectHistoryKeyTarget('ArrowUp', tree, ids, PROJECT_HISTORY_HERE)).toEqual({
      kind: 'select',
      id: PROJECT_HISTORY_HERE,
    });
    expect(dialogProjectHistoryKeyTarget('End', tree, ids, b.id)).toEqual({ kind: 'select', id: a.id });
    expect(dialogProjectHistoryKeyTarget('ArrowLeft', tree, ids, b.id)).toEqual({ kind: 'select', id: a.id });
    expect(dialogProjectHistoryKeyTarget('ArrowRight', tree, ids, a.id)).toEqual({ kind: 'select', id: b.id });
    expect(dialogProjectHistoryKeyTarget('Enter', tree, ids, a.id)).toEqual({ kind: 'restore' });
    expect(dialogProjectHistoryKeyTarget('F2', tree, ids, a.id)).toEqual({ kind: 'rename' });
    expect(dialogProjectHistoryKeyTarget('Delete', tree, ids, a.id)).toEqual({ kind: 'remove' });
    expect(dialogProjectHistoryKeyTarget('x', tree, ids, a.id)).toBeNull();
  });
});
