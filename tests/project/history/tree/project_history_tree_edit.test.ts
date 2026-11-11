import { describe, expect, it } from 'vitest';
import { projectHistoryIndexCreate, projectHistoryIndexParse } from '@/project/history/tree/project_history_tree.js';
import {
  PROJECT_HISTORY_SESSION_IDLE_MS,
  projectHistoryTreeAutosave,
  projectHistoryTreeCleanup,
  projectHistoryTreeRemove,
  projectHistoryTreeRename,
  projectHistoryTreeRestore,
  projectHistoryTreeSnapshot,
} from '@/project/history/tree/project_history_tree_edit.js';

const MINUTE = 60_000;

/**
 * Builds an empty level tree.
 *
 * @returns Index.
 */
function tree() {
  return projectHistoryIndexCreate('level', 'maps/start.aiworld');
}

describe('project history tree', () => {
  it('lets autosaves replace the live session until 30 idle minutes pass', () => {
    const index = tree();
    const first = projectHistoryTreeAutosave(index, 0, 1);
    const again = projectHistoryTreeAutosave(index, 10 * MINUTE, 2);
    expect(first.created).toBe(true);
    expect(again).toMatchObject({ created: false, node: { id: first.node.id, autosaves: 2, objectCount: 2 } });
    expect(again.node.started).toBe(0);
    const later = projectHistoryTreeAutosave(index, 10 * MINUTE + PROJECT_HISTORY_SESSION_IDLE_MS, 3);
    expect(later.created).toBe(true);
    expect(later.node.parent).toBe(first.node.id);
    expect(index).toMatchObject({ marker: later.node.id, live: later.node.id });
  });

  it('grows a new session from a snapshot taken by hand', () => {
    const index = tree();
    const session = projectHistoryTreeAutosave(index, 0, 1).node;
    const snapshot = projectHistoryTreeSnapshot(index, MINUTE, 1, '  Gate   And Towers ');
    expect(snapshot).toMatchObject({ name: 'Gate And Towers', kind: 'snapshot', parent: session.id });
    expect(index.live).toBeNull();
    const next = projectHistoryTreeAutosave(index, 2 * MINUTE, 2).node;
    expect(next.parent).toBe(snapshot.id);
  });

  it('branches from a restored state and keeps the old future, with no extra state', () => {
    const index = tree();
    const a = projectHistoryTreeAutosave(index, 0, 1).node;
    const b = projectHistoryTreeAutosave(index, PROJECT_HISTORY_SESSION_IDLE_MS, 2).node;
    expect(projectHistoryTreeRestore(index, a.id)).toBe(true);
    expect(index.nodes).toHaveLength(2);
    const c = projectHistoryTreeAutosave(index, PROJECT_HISTORY_SESSION_IDLE_MS + MINUTE, 3).node;
    expect(c.parent).toBe(a.id);
    expect(index.nodes.map((node) => node.id)).toEqual([a.id, b.id, c.id]);
    expect(projectHistoryTreeRestore(index, 'missing')).toBe(false);
  });

  it('locks a state by naming it, and an unnamed state again by clearing the name', () => {
    const index = tree();
    const live = projectHistoryTreeAutosave(index, 0, 1).node;
    projectHistoryTreeRename(index, live.id, 'Keep Interior');
    expect(index.live).toBeNull();
    expect(projectHistoryTreeAutosave(index, MINUTE, 2).node.parent).toBe(live.id);
    const snapshot = projectHistoryTreeSnapshot(index, 2 * MINUTE, 2, 'Gate');
    expect(projectHistoryTreeRename(index, snapshot.id, '   ')).toMatchObject({ name: '', kind: 'session' });
    expect(projectHistoryTreeRename(index, 'missing', 'x')).toBeNull();
  });

  it('removes a state, attaching its children to its parent and moving the marker up', () => {
    const index = tree();
    const a = projectHistoryTreeSnapshot(index, 0, 1, 'A');
    const b = projectHistoryTreeSnapshot(index, MINUTE, 1, 'B');
    const c = projectHistoryTreeSnapshot(index, 2 * MINUTE, 1, 'C');
    projectHistoryTreeRestore(index, b.id);
    expect(projectHistoryTreeRemove(index, b.id)).toBe(true);
    expect(index.nodes.find((node) => node.id === c.id)?.parent).toBe(a.id);
    expect(index.marker).toBe(a.id);
    expect(projectHistoryTreeRemove(index, b.id)).toBe(false);
  });

  it('keeps every named state and the newest unnamed ones, never the marker or live session', () => {
    const index = tree();
    const named = projectHistoryTreeSnapshot(index, 0, 1, 'Kept');
    for (let round = 1; round <= 6; round++)
      projectHistoryTreeAutosave(index, round * PROJECT_HISTORY_SESSION_IDLE_MS * 2, round);
    const oldest = index.nodes[1];
    const removed = projectHistoryTreeCleanup(index, 3);
    expect(removed).toHaveLength(3);
    expect(removed).toContain(oldest?.id);
    expect(index.nodes.map((node) => node.name)).toContain('Kept');
    expect(index.nodes.filter((node) => node.name === '')).toHaveLength(3);
    expect(index.nodes.find((node) => node.parent === named.id)).toBeDefined();
    projectHistoryTreeRestore(index, index.nodes[1]?.id ?? '');
    expect(projectHistoryTreeCleanup(index, 0)).not.toContain(index.marker);
  });

  it('reads back what it writes and drops what it cannot trust', () => {
    const index = tree();
    const a = projectHistoryTreeAutosave(index, 0, 1).node;
    expect(projectHistoryIndexParse(JSON.stringify(index))).toEqual(index);
    const broken = {
      ...index,
      marker: 'gone',
      nodes: [...index.nodes, { id: '../x', time: 1 }, { ...a, id: '20260101-000000-000', parent: 'gone' }],
    };
    const parsed = projectHistoryIndexParse(JSON.stringify(broken));
    expect(parsed?.marker).toBeNull();
    expect(parsed?.nodes.map((node) => [node.id, node.parent])).toEqual([
      [a.id, null],
      ['20260101-000000-000', null],
    ]);
    expect(projectHistoryIndexParse('{"format":"other"}')).toBeNull();
    expect(projectHistoryIndexParse('nope')).toBeNull();
  });
});
