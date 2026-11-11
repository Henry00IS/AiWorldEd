import { projectHistoryNodeFind } from '@/project/history/tree/project_history_tree.js';
import { PROJECT_HISTORY_HERE } from '@/project/history/tree/project_history_tree_layout.js';
import type { DialogProjectHistoryTree } from './dialog_project_history_types.js';

/** What a key does in the tree. */
export type DialogProjectHistoryKeyAction =
  { kind: 'select'; id: string } | { kind: 'restore' } | { kind: 'rename' } | { kind: 'remove' };

/**
 * Maps a key on a tree row to its action: Up and Down step through the rows,
 * Home and End jump to the newest and oldest, Left goes to the state a row grew
 * from, Right to the newest state that grew from it, Enter restores, F2
 * renames, Delete deletes.
 *
 * @param key Key name.
 * @param tree Shown tree.
 * @param ids Row ids, newest first.
 * @param selected Selected row id.
 * @returns Action, or null when the key does nothing.
 */
export function dialogProjectHistoryKeyTarget(
  key: string,
  tree: DialogProjectHistoryTree,
  ids: readonly string[],
  selected: string,
): DialogProjectHistoryKeyAction | null {
  const index = ids.indexOf(selected);
  const step = (offset: number) => ids[Math.min(ids.length - 1, Math.max(0, index + offset))];
  const target = {
    ArrowUp: step(-1),
    ArrowDown: step(1),
    Home: ids[0],
    End: ids.at(-1),
    ArrowLeft: dialogProjectHistoryKeyParent(tree, selected),
    ArrowRight: dialogProjectHistoryKeyChild(tree, ids, selected),
  }[key];
  if (target !== undefined && target !== null) return { kind: 'select', id: target };
  const actions: Record<string, DialogProjectHistoryKeyAction> = {
    Enter: { kind: 'restore' },
    F2: { kind: 'rename' },
    Delete: { kind: 'remove' },
  };
  return actions[key] ?? null;
}

/**
 * Finds the row a row grew from.
 *
 * @param tree Tree.
 * @param id Row id.
 * @returns Parent row id, or null.
 */
function dialogProjectHistoryKeyParent(tree: DialogProjectHistoryTree, id: string): string | null {
  if (id === PROJECT_HISTORY_HERE) return tree.index.marker;
  return projectHistoryNodeFind(tree.index, id)?.parent ?? null;
}

/**
 * Finds the newest row that grew from a row.
 *
 * @param tree Tree.
 * @param ids Row ids, newest first.
 * @param id Row id.
 * @returns Child row id, or null.
 */
function dialogProjectHistoryKeyChild(
  tree: DialogProjectHistoryTree,
  ids: readonly string[],
  id: string,
): string | null {
  for (const candidate of ids) {
    const parent =
      candidate === PROJECT_HISTORY_HERE ? tree.index.marker : projectHistoryNodeFind(tree.index, candidate)?.parent;
    if (parent === id) return candidate;
  }
  return null;
}
