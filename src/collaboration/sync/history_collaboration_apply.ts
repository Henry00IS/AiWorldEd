import type { NodeCollaborationState } from '@/collaboration/scene/node_collaboration_types.js';
import { NODE_PARENT_WORLD } from '@/collaboration/scene/node_collaboration_types.js';
import type { HistoryCollaborationEntry } from '@/collaboration/sync/history_collaboration_stack.js';
import type { ReplicaCollaborationScene } from '@/collaboration/sync/replica_collaboration_scene.js';
import type { EditOperation } from '@/collaboration/shared/protocol_definitions.js';
import {
  hierarchyCollaborationBlock,
  hierarchyCollaborationChain,
} from '@/collaboration/sync/hierarchy_collaboration_locks.js';
import { fieldCollaborationDiff, fieldCollaborationMerge } from '@/collaboration/sync/field_collaboration_paths.js';
import { trackerOperation } from '@/collaboration/sync/tracker_collaboration_commit.js';

/** Result of checking whether a history step may be applied now. */
export type HistoryCollaborationCheck =
  | { ok: true }
  | { ok: false; reason: 'locked'; id: string; holder: number };

/** Why one change of a history step was skipped. */
export type HistoryCollaborationSkipReason =
  /** Another member deleted the node; it is not resurrected. */
  | 'deleted'
  /** Another member deleted the container the node would return into. */
  | 'parent_deleted'
  /** Another member added objects inside a node the step would delete. */
  | 'foreign_children';

/** One skipped change. */
export interface HistoryCollaborationSkip {
  id: string;
  reason: HistoryCollaborationSkipReason;
}

/** Operations, changed ids and skipped changes produced by a history step. */
export interface HistoryCollaborationApplied {
  ops: EditOperation[];
  changed: Set<string>;
  skipped: HistoryCollaborationSkip[];
}

/**
 * Checks whether a history step may run now. Undo is per user and
 * last-writer-wins, so a node another member changed meanwhile is not a
 * reason to refuse: only nodes (or target containers) inside another member's
 * active edit lease are, exactly like a one-shot edit.
 *
 * @param replica Scene replica.
 * @param entry History step.
 * @param redo True to check a redo, false for an undo.
 * @returns Check result.
 */
export function historyCollaborationCheck(
  replica: ReplicaCollaborationScene,
  entry: HistoryCollaborationEntry,
  redo: boolean,
): HistoryCollaborationCheck {
  const self = replica.locks.selfGet();
  const parentOf = historyCollaborationParents(replica, entry, redo);
  for (const change of entry.changes) {
    const holder = replica.locks.holder(change.id);
    if (holder !== undefined && holder !== self) return { ok: false, reason: 'locked', id: change.id, holder };
    const target = redo ? change.after : change.before;
    if (target === null || replica.baselines.get(change.id)?.state.parent === target.parent) continue;
    const block = hierarchyCollaborationBlock(replica.locks, hierarchyCollaborationChain(parentOf, target.parent));
    if (block !== null) return { ok: false, reason: 'locked', id: block.id, holder: block.holder };
  }
  return { ok: true };
}

/**
 * Returns a parent lookup that sees a step's target states before the agreed
 * ones.
 *
 * @param replica Scene replica.
 * @param entry History step.
 * @param redo True for the after states.
 * @returns Parent id of a node, or undefined.
 */
function historyCollaborationParents(
  replica: ReplicaCollaborationScene,
  entry: HistoryCollaborationEntry,
  redo: boolean,
): (id: string) => string | undefined {
  const targets = new Map<string, string>();
  entry.changes.forEach((change) => {
    const target = redo ? change.after : change.before;
    if (target !== null) targets.set(change.id, target.parent);
  });
  return (id) => targets.get(id) ?? replica.baselines.get(id)?.state.parent;
}

/**
 * Applies a history step as a field-level inverse on top of the current agreed
 * scene (last-writer-wins): only the fields the step itself changed are
 * written back, so concurrent edits of other fields by other members survive.
 * Changes of nodes another member deleted are skipped (never resurrected),
 * nodes never return into a container another member deleted, and a node the
 * step would delete is kept while other members' objects live inside it.
 *
 * @param replica Scene replica.
 * @param entry History step.
 * @param redo True to redo, false to undo.
 * @returns Operations to send, ids changed locally and skipped changes.
 */
export function historyCollaborationApply(
  replica: ReplicaCollaborationScene,
  entry: HistoryCollaborationEntry,
  redo: boolean,
): HistoryCollaborationApplied {
  const skipped: HistoryCollaborationSkip[] = [];
  const stepIds = new Set(entry.changes.map((change) => change.id));
  const deleting = new Set<string>();
  entry.changes.forEach((change) => {
    if ((redo ? change.after : change.before) === null) deleting.add(change.id);
  });
  const creating = new Set<string>();
  entry.changes.forEach((change) => {
    const target = redo ? change.after : change.before;
    if (target !== null && !replica.baselines.has(change.id) && (redo ? change.before : change.after) === null)
      creating.add(change.id);
  });
  const exists = (id: string): boolean =>
    id === NODE_PARENT_WORLD || (replica.baselines.has(id) && !deleting.has(id)) || creating.has(id);
  const upserts: NodeCollaborationState[] = [];
  const befores = new Map<string, NodeCollaborationState>();
  const deletes: string[] = [];
  let foreign: Set<string> | undefined;
  for (const change of entry.changes) {
    const target = redo ? change.after : change.before;
    const from = redo ? change.before : change.after;
    const current = replica.baselines.get(change.id)?.state;
    if (target === null) {
      if (current === undefined) continue;
      foreign ??= historyCollaborationForeignParents(replica, stepIds);
      if (foreign.has(change.id)) {
        skipped.push({ id: change.id, reason: 'foreign_children' });
        deleting.delete(change.id);
        continue;
      }
      deletes.push(change.id);
      continue;
    }
    if (current === undefined) {
      if (from !== null) {
        skipped.push({ id: change.id, reason: 'deleted' });
        continue;
      }
      upserts.push(target);
      continue;
    }
    const paths = from === null ? null : fieldCollaborationDiff(from, target);
    const next = paths === null ? structuredClone(target) : fieldCollaborationMerge(current, target, paths);
    befores.set(change.id, current);
    upserts.push(next);
  }
  // Second pass: a node may not land in a container that no longer exists.
  const kept: NodeCollaborationState[] = [];
  let pending = upserts;
  for (let round = 0; round < 4 && pending.length > 0; round += 1) {
    const next: NodeCollaborationState[] = [];
    for (const state of pending) {
      if (exists(state.parent)) {
        kept.push(state);
        continue;
      }
      const current = befores.get(state.id);
      if (current !== undefined && exists(current.parent)) {
        kept.push({ ...state, parent: current.parent });
        continue;
      }
      creating.delete(state.id);
      next.push(state);
    }
    if (next.length === pending.length) {
      next.forEach((state) => skipped.push({ id: state.id, reason: 'parent_deleted' }));
      break;
    }
    pending = next;
  }
  const ordered = historyCollaborationOrder(kept);
  const parentOf = historyCollaborationParents(replica, entry, redo);
  const ops = ordered.map((state) => historyCollaborationOperation(replica, state, parentOf));
  deletes.forEach((id) => ops.push({ k: 'delete', ids: [id] }));
  const changed = replica.statesApply(ordered, deletes, new Map(), false, 'local');
  return { ops, changed, skipped };
}

/**
 * Returns the nodes that directly contain an object outside a history step:
 * such a node is not deleted by undo, so other members' work is never removed
 * with it. Built once per step (linear in the scene).
 *
 * @param replica Scene replica.
 * @param stepIds Ids of the step's own nodes.
 * @returns Parent ids with a child outside the step.
 */
function historyCollaborationForeignParents(
  replica: ReplicaCollaborationScene,
  stepIds: ReadonlySet<string>,
): Set<string> {
  const parents = new Set<string>();
  for (const [child, baseline] of replica.baselines) {
    if (!stepIds.has(child)) parents.add(baseline.state.parent);
  }
  return parents;
}

/**
 * Builds the operation that upserts one state, chosen against the current
 * agreed state of the node, carrying the changed field paths.
 *
 * @param replica Scene replica.
 * @param state Target state.
 * @param parentOf Parent lookup for the parent chain of creates and moves.
 * @returns Edit operation.
 */
function historyCollaborationOperation(
  replica: ReplicaCollaborationScene,
  state: NodeCollaborationState,
  parentOf: (id: string) => string | undefined,
): EditOperation {
  const current = replica.baselines.get(state.id)?.state;
  const kind = current === undefined ? 'create' : current.parent !== state.parent ? 'reparent' : 'property';
  return trackerOperation(kind, state, parentOf, current ?? null);
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
