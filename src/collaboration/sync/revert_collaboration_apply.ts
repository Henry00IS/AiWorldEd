import type { NodeCollaborationState } from '@/collaboration/scene/node_collaboration_types.js';
import type { ReplicaCollaborationScene } from '@/collaboration/sync/replica_collaboration_scene.js';

/** Local changes to undo because the local user does not hold the nodes. */
export interface RevertCollaborationPlan {
  restore: Set<string>;
  remove: Set<string>;
  parents: Set<string>;
}

/**
 * Restores nodes to their agreed states, removes nodes that must not exist and
 * re-sorts sibling lists whose agreed order was broken locally.
 *
 * @param replica Scene replica.
 * @param plan Revert plan.
 * @returns Ids that were reverted.
 */
export function revertCollaborationApply(replica: ReplicaCollaborationScene, plan: RevertCollaborationPlan): string[] {
  if (plan.restore.size === 0 && plan.remove.size === 0 && plan.parents.size === 0) return [];
  const states = revertCollaborationOrdered(replica, plan.restore);
  plan.parents.forEach((parent) => replica.applier.orderTouch(parent));
  replica.statesApply(states, [...plan.remove], new Map(), false, 'local');
  return [...plan.restore, ...plan.remove];
}

/**
 * Returns the agreed states of nodes to restore, parents first.
 *
 * @param replica Scene replica.
 * @param ids Ids to restore.
 * @returns Ordered states.
 */
export function revertCollaborationOrdered(
  replica: ReplicaCollaborationScene,
  ids: ReadonlySet<string>,
): NodeCollaborationState[] {
  const depth = (id: string): number => {
    let count = 0;
    let current = replica.baselines.get(id)?.state;
    while (current !== undefined && current.parent !== '' && count < 4096) {
      current = replica.baselines.get(current.parent)?.state ?? replica.baselines.get(current.model ?? '')?.state;
      count += 1;
    }
    return count;
  };
  const states: NodeCollaborationState[] = [];
  ids.forEach((id) => {
    const state = replica.baselines.get(id)?.state;
    if (state !== undefined) states.push(state);
  });
  return states.sort((a, b) => depth(a.id) - depth(b.id));
}
