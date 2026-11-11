import { describe, expect, it } from 'vitest';
import { projectHistoryIndexCreate } from '@/project/history/tree/project_history_tree.js';
import {
  PROJECT_HISTORY_SESSION_IDLE_MS,
  projectHistoryTreeAutosave,
  projectHistoryTreeRestore,
  projectHistoryTreeSnapshot,
} from '@/project/history/tree/project_history_tree_edit.js';
import { PROJECT_HISTORY_HERE, projectHistoryTreeLayout } from '@/project/history/tree/project_history_tree_layout.js';

const GAP = PROJECT_HISTORY_SESSION_IDLE_MS + 1;

describe('project history tree layout', () => {
  it('lists the newest first with You Are Here on top, and keeps the current branch leftmost', () => {
    const index = projectHistoryIndexCreate('level', 'x');
    const a = projectHistoryTreeSnapshot(index, 0, 1, 'Gate');
    const b = projectHistoryTreeAutosave(index, GAP, 2).node;
    projectHistoryTreeRestore(index, a.id);
    const c = projectHistoryTreeAutosave(index, 2 * GAP, 3).node;
    const layout = projectHistoryTreeLayout(index, true);
    expect(layout.rows.map((row) => row.id)).toEqual([PROJECT_HISTORY_HERE, c.id, b.id, a.id]);
    const lane = (id: string) => layout.rows.find((row) => row.id === id)?.lane;
    expect([lane(PROJECT_HISTORY_HERE), lane(c.id), lane(a.id)]).toEqual([0, 0, 0]);
    expect(lane(b.id)).toBe(1);
    expect(layout.lanes).toBe(2);
    expect(layout.rows.find((row) => row.id === b.id)?.onPath).toBe(false);
    expect(layout.rows.find((row) => row.id === c.id)?.onPath).toBe(true);
  });

  it('shows no You Are Here for a tree whose work is not open', () => {
    const index = projectHistoryIndexCreate('level', 'x');
    projectHistoryTreeAutosave(index, 0, 1);
    expect(projectHistoryTreeLayout(index, false).rows.map((row) => row.id)).not.toContain(PROJECT_HISTORY_HERE);
    expect(projectHistoryTreeLayout(projectHistoryIndexCreate('level', 'x'), false)).toEqual({ rows: [], lanes: 1 });
  });
});
