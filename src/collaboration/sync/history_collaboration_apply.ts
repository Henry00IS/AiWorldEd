import { codecStateText } from '@/collaboration/scene/node_collaboration_codec.js';
import type { NodeCollaborationState } from '@/collaboration/scene/node_collaboration_types.js';
import type { HistoryCollaborationEntry } from '@/collaboration/sync/history_collaboration_stack.js';
import type { ReplicaCollaborationScene } from '@/collaboration/sync/replica_collaboration_scene.js';
import type { EditOperation } from '@/collaboration/shared/protocol_definitions.js';

/** Result of checking whether a history step may be applied. */
export type HistoryCollaborationCheck =
  | { ok: true; missing: string[] }
  | { ok: false; reason: 'changed'; id: string }
  | { ok: false; reason: 'locked'; id: string; holder: number };

/** Operations and changed ids produced by applying a history step. */
export interface HistoryCollaborationApplied {
  ops: EditOperation[];
  changed: Set<string>;
}

/**
 * Checks that a history step only touches the local user's own work: every node
 * must still be in the state the step left it in, and no other member may hold
 * any of its nodes.
 *
 * @param replica Scene replica.
 * @param entry History step.
 * @param redo True to check a redo, false for an undo.
 * @returns Check result with the ids that still need a lock.
 */
export function historyCollaborationCheck(
  replica: ReplicaCollaborationScene,
  entry: HistoryCollaborationEntry,
  redo: boolean,
): HistoryCollaborationCheck {
  const missing: string[] = [];
  for (const change of entry.changes) {
    const expected = redo ? change.before : change.after;
    const text = replica.baselines.get(change.id)?.text ?? null;
    if (text !== (expected === null ? null : codecStateText(expected)))
      return { ok: false, reason: 'changed', id: change.id };
    const holder = replica.locks.holder(change.id);
    if (holder !== undefined && holder !== replica.locks.selfGet()) {
      return { ok: false, reason: 'locked', id: change.id, holder };
    }
    if (holder === undefined) missing.push(change.id);
  }
  return { ok: true, missing };
}

/**
 * Writes the before (undo) or after (redo) states of a history step into the
 * scene and returns the operations that replicate it.
 *
 * @param replica Scene replica.
 * @param entry History step.
 * @param redo True to redo, false to undo.
 * @returns Operations to send and ids changed locally.
 */
export function historyCollaborationApply(
  replica: ReplicaCollaborationScene,
  entry: HistoryCollaborationEntry,
  redo: boolean,
): HistoryCollaborationApplied {
  const upserts: NodeCollaborationState[] = [];
  const deletes: string[] = [];
  entry.changes.forEach((change) => {
    const target = redo ? change.after : change.before;
    if (target !== null) upserts.push(target);
    else if (replica.baselines.has(change.id)) deletes.push(change.id);
  });
  const ordered = historyCollaborationOrder(upserts);
  const ops = ordered.map((state) => historyCollaborationOperation(replica, state));
  deletes.forEach((id) => ops.push({ k: 'delete', ids: [id] }));
  const changed = replica.statesApply(ordered, deletes, new Map(), false, 'local');
  return { ops, changed };
}

/**
 * Builds the operation that upserts one state, chosen against the current
 * agreed state of the node.
 *
 * @param replica Scene replica.
 * @param state Target state.
 * @returns Edit operation.
 */
function historyCollaborationOperation(
  replica: ReplicaCollaborationScene,
  state: NodeCollaborationState,
): EditOperation {
  const current = replica.baselines.get(state.id)?.state;
  const kind = current === undefined ? 'create' : current.parent !== state.parent ? 'reparent' : 'property';
  return { k: kind, ids: [state.id], d: { s: state } };
}

/**
 * Orders states so parents come before their children.
 *
 * @param states States to order.
 * @returns Ordered copy.
 */
export function historyCollaborationOrder(states: readonly NodeCollaborationState[]): NodeCollaborationState[] {
  const byId = new Map(states.map((state) => [state.id, state]));
  const depth = (state: NodeCollaborationState): number => {
    let count = 0;
    let parent = byId.get(state.parent);
    while (parent !== undefined && count < states.length) {
      count += 1;
      parent = byId.get(parent.parent);
    }
    return count;
  };
  return [...states].sort((a, b) => depth(a) - depth(b));
}
