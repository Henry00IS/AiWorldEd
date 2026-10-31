import type * as THREE from 'three';
import type { IndexCollaborationNodes } from '@/collaboration/scene/node_collaboration_index.js';
import type { LockCollaborationTable } from '@/collaboration/sync/lock_collaboration_table.js';

/** A node of a selection that another member holds. */
export interface SelectionCollaborationBlock {
  id: string;
  holder: number;
}

/**
 * Returns the wire ids a selection must lock: each selected node with its whole
 * subtree. Meshes that are not nodes (CSG results) map to their nearest node
 * ancestor, which locks the whole solid model.
 *
 * @param nodes Node index.
 * @param objects Selected objects.
 * @returns Ids to lock.
 */
export function selectionCollaborationIds(
  nodes: IndexCollaborationNodes,
  objects: Iterable<THREE.Object3D>,
): Set<string> {
  const ids = new Set<string>();
  for (const object of objects) {
    const ref = nodes.forObjectOrAncestor(object);
    if (ref !== undefined && !ids.has(ref.id)) nodes.subtreeCollect(ref.id, ids);
  }
  return ids;
}

/**
 * Returns the first id of a set that another member holds.
 *
 * @param locks Lock table.
 * @param ids Ids to check.
 * @returns Blocking id and holder, or null.
 */
export function selectionCollaborationBlock(
  locks: LockCollaborationTable,
  ids: Iterable<string>,
): SelectionCollaborationBlock | null {
  for (const id of ids) {
    const holder = locks.holder(id);
    if (holder !== undefined && holder !== locks.selfGet()) return { id, holder };
  }
  return null;
}

/**
 * Splits ids into lock messages within the relay id limit.
 *
 * @param ids Ids to lock.
 * @param perMessage Maximum ids per message.
 * @returns Chunks in order.
 */
export function selectionCollaborationChunks(ids: readonly string[], perMessage: number): string[][] {
  const size = Math.max(1, perMessage);
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += size) chunks.push(ids.slice(index, index + size));
  return chunks;
}
