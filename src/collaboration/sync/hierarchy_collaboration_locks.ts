import { NODE_PARENT_WORLD } from '@/collaboration/scene/node_collaboration_types.js';
import type { LockCollaborationTable } from '@/collaboration/sync/lock_collaboration_table.js';

/** Upper bound on walked ancestors, guarding against cycles in malformed data. */
const HIERARCHY_COLLABORATION_DEPTH = 4096;

/**
 * Returns a parent chain: the parent first, then its ancestors up to the world.
 *
 * @param parentOf Returns the parent id of a node, or undefined when unknown.
 * @param parent Direct parent id.
 * @returns Ancestor ids, nearest first, without the world.
 */
export function hierarchyCollaborationChain(parentOf: (id: string) => string | undefined, parent: string): string[] {
  const chain: string[] = [];
  const seen = new Set<string>();
  let current: string | undefined = parent;
  while (current !== undefined && current !== NODE_PARENT_WORLD && !seen.has(current)) {
    if (chain.length >= HIERARCHY_COLLABORATION_DEPTH) break;
    seen.add(current);
    chain.push(current);
    current = parentOf(current);
  }
  return chain;
}

/**
 * Returns the ancestors a set of exclusive locks must share: every ancestor of
 * a locked node that is not itself locked exclusively.
 *
 * @param parents Parent id by node id.
 * @param exclusive Ids locked exclusively (selected nodes with their subtrees).
 * @returns Shared ancestor ids.
 */
export function hierarchyCollaborationShared(
  parents: ReadonlyMap<string, string>,
  exclusive: ReadonlySet<string>,
): string[] {
  const shared = new Set<string>();
  const parentOf = (id: string): string | undefined => parents.get(id);
  exclusive.forEach((id) => {
    const parent = parents.get(id);
    if (parent === undefined || exclusive.has(parent) || shared.has(parent)) return;
    hierarchyCollaborationChain(parentOf, parent).forEach((ancestor) => {
      if (!exclusive.has(ancestor)) shared.add(ancestor);
    });
  });
  return [...shared];
}

/**
 * Returns the nearest node of a chain another member holds.
 *
 * @param locks Lock table.
 * @param chain Ancestor ids, nearest first.
 * @returns Blocking id and holder, or null.
 */
export function hierarchyCollaborationBlock(
  locks: LockCollaborationTable,
  chain: readonly string[],
): { id: string; holder: number } | null {
  for (const id of chain) {
    const holder = locks.holder(id);
    if (holder !== undefined && holder !== locks.selfGet()) return { id, holder };
  }
  return null;
}
