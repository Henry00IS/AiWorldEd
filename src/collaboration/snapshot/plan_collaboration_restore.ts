import { codecStateText } from '@/collaboration/scene/node_collaboration_codec.js';
import {
  NODE_PARENT_WORLD,
  type NodeCollaborationBaseline,
  type NodeCollaborationState,
} from '@/collaboration/scene/node_collaboration_types.js';
import {
  hierarchyCollaborationBlock,
  hierarchyCollaborationChain,
} from '@/collaboration/sync/hierarchy_collaboration_locks.js';
import type { LockCollaborationTable } from '@/collaboration/sync/lock_collaboration_table.js';
import type { TrackerCollaborationChange } from '@/collaboration/sync/tracker_collaboration_commit.js';

/** Why an object was left out of a restore. */
export type PlanCollaborationSkipReason = 'locked' | 'container-locked' | 'busy' | 'dependent';

/** An object a restore left as it is. */
export interface PlanCollaborationSkip {
  id: string;
  reason: PlanCollaborationSkipReason;
  holder: number;
}

/**
 * Changes that turn the current scene into a snapshot, minus what cannot
 * change.
 */
export interface PlanCollaborationRestore {
  changes: TrackerCollaborationChange[];
  skipped: PlanCollaborationSkip[];
}

/** Agreed scene and locks a restore is planned against. */
export interface PlanCollaborationScene {
  baselines: ReadonlyMap<string, NodeCollaborationBaseline>;
  locks: LockCollaborationTable;
}

/**
 * Plans a restore: every object whose agreed state differs from the snapshot is
 * set back, created or deleted, except objects other members hold, objects
 * inside containers they hold, and objects whose parent or children those
 * exceptions keep in place.
 *
 * @param scene Agreed scene and locks.
 * @param states Snapshot states.
 * @param busy Ids that could not be locked.
 * @returns Changes and skipped objects.
 */
export function planCollaborationRestore(
  scene: PlanCollaborationScene,
  states: readonly NodeCollaborationState[],
  busy: ReadonlySet<string> = new Set(),
): PlanCollaborationRestore {
  const changes = planCollaborationChanges(scene.baselines, states);
  const skipped = new Map<string, PlanCollaborationSkip>();
  changes.forEach((change) => {
    const skip = planCollaborationSkip(scene, changes, change, busy);
    if (skip !== null) skipped.set(change.id, skip);
  });
  planCollaborationDependents(scene.baselines, changes, skipped);
  return { changes: changes.filter((change) => !skipped.has(change.id)), skipped: [...skipped.values()] };
}

/**
 * Diffs the agreed scene against a snapshot.
 *
 * @param baselines Agreed states.
 * @param states Snapshot states.
 * @returns Changes from the agreed scene to the snapshot.
 */
function planCollaborationChanges(
  baselines: ReadonlyMap<string, NodeCollaborationBaseline>,
  states: readonly NodeCollaborationState[],
): TrackerCollaborationChange[] {
  const changes: TrackerCollaborationChange[] = [];
  const wanted = new Set<string>();
  states.forEach((state) => {
    wanted.add(state.id);
    const current = baselines.get(state.id);
    if (current?.text !== codecStateText(state))
      changes.push({ id: state.id, before: current?.state ?? null, after: state });
  });
  baselines.forEach((baseline, id) => {
    if (!wanted.has(id)) changes.push({ id, before: baseline.state, after: null });
  });
  return changes;
}

/**
 * Tells whether locks keep one change from applying.
 *
 * @param scene Agreed scene and locks.
 * @param changes Every planned change.
 * @param change Change to check.
 * @param busy Ids that could not be locked.
 * @returns Skip, or null when the change may apply.
 */
function planCollaborationSkip(
  scene: PlanCollaborationScene,
  changes: readonly TrackerCollaborationChange[],
  change: TrackerCollaborationChange,
  busy: ReadonlySet<string>,
): PlanCollaborationSkip | null {
  const holder = scene.locks.holder(change.id);
  if (holder !== undefined && holder !== scene.locks.selfGet()) return { id: change.id, reason: 'locked', holder };
  if (busy.has(change.id)) return { id: change.id, reason: 'busy', holder: -1 };
  const parent = change.after?.parent ?? change.before?.parent ?? NODE_PARENT_WORLD;
  const block = hierarchyCollaborationBlock(
    scene.locks,
    hierarchyCollaborationChain(planCollaborationParents(scene.baselines, changes), parent),
  );
  return block === null ? null : { id: change.id, reason: 'container-locked', holder: block.holder };
}

/**
 * Returns a parent lookup that sees snapshot states before agreed ones.
 *
 * @param baselines Agreed states.
 * @param changes Planned changes.
 * @returns Parent id of a node, or undefined.
 */
function planCollaborationParents(
  baselines: ReadonlyMap<string, NodeCollaborationBaseline>,
  changes: readonly TrackerCollaborationChange[],
): (id: string) => string | undefined {
  const targets = new Map<string, string>();
  changes.forEach((change) => {
    if (change.after !== null) targets.set(change.id, change.after.parent);
  });
  return (id) => targets.get(id) ?? baselines.get(id)?.state.parent;
}

/**
 * Skips changes that depend on skipped ones until none is left: a delete whose
 * object keeps a child, and a create or move under a parent that will not
 * exist.
 *
 * @param baselines Agreed states.
 * @param changes Planned changes.
 * @param skipped Skips so far; extended in place.
 */
function planCollaborationDependents(
  baselines: ReadonlyMap<string, NodeCollaborationBaseline>,
  changes: readonly TrackerCollaborationChange[],
  skipped: Map<string, PlanCollaborationSkip>,
): void {
  for (let pass = 0; pass < changes.length + 1; pass += 1) {
    const parents = planCollaborationFinalParents(baselines, changes, skipped);
    const kept = new Set(parents.values());
    const before = skipped.size;
    changes.forEach((change) => {
      if (skipped.has(change.id)) return;
      const orphan =
        change.after !== null && change.after.parent !== NODE_PARENT_WORLD && !parents.has(change.after.parent);
      if ((change.after === null && kept.has(change.id)) || orphan)
        skipped.set(change.id, { id: change.id, reason: 'dependent', holder: -1 });
    });
    if (skipped.size === before) return;
  }
}

/**
 * Returns the parent of every object that exists after applying the changes
 * that are not skipped.
 *
 * @param baselines Agreed states.
 * @param changes Planned changes.
 * @param skipped Skipped changes.
 * @returns Parent id by object id.
 */
function planCollaborationFinalParents(
  baselines: ReadonlyMap<string, NodeCollaborationBaseline>,
  changes: readonly TrackerCollaborationChange[],
  skipped: ReadonlyMap<string, PlanCollaborationSkip>,
): Map<string, string> {
  const parents = new Map<string, string>();
  baselines.forEach((baseline, id) => parents.set(id, baseline.state.parent));
  changes.forEach((change) => {
    if (skipped.has(change.id)) return;
    if (change.after === null) parents.delete(change.id);
    else parents.set(change.id, change.after.parent);
  });
  return parents;
}
