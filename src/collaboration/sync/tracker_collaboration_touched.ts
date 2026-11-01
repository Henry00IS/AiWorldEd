import type * as THREE from 'three';
import { nodeFingerprint } from '@/collaboration/scene/node_collaboration_fingerprint.js';
import type { IndexCollaborationNodes } from '@/collaboration/scene/node_collaboration_index.js';
import { hierarchyCollaborationChain } from '@/collaboration/sync/hierarchy_collaboration_locks.js';
import type { ReplicaCollaborationScene } from '@/collaboration/sync/replica_collaboration_scene.js';
import { revertCollaborationApply } from '@/collaboration/sync/revert_collaboration_apply.js';

/** A created or moved node and its new parent. */
export interface TrackerCollaborationMove {
  object: THREE.Object3D;
  parent: string;
}

/**
 * Uncommitted local changes the user does not hold yet: what a tool run must
 * lock before its edit can be sent.
 */
export interface TrackerCollaborationTouch {
  /** Changed or deleted nodes the user does not hold. */
  ids: string[];
  /** Scene objects of the changed nodes that still exist. */
  objects: THREE.Object3D[];
  /** Created or reparented nodes. */
  moves: TrackerCollaborationMove[];
  /** New parent chains of the moves, without duplicates. */
  chains: string[];
  /** Every changed or deleted node with a baseline, held or not. */
  restore: string[];
  /** Every created node. */
  remove: string[];
}

/**
 * Lists uncommitted changes without committing or reverting anything.
 *
 * @param replica Scene replica.
 * @returns Touched nodes and the containers they now live in.
 */
export function trackerCollaborationTouched(replica: ReplicaCollaborationScene): TrackerCollaborationTouch {
  replica.applier.invalidate();
  const nodes = replica.applier.nodes();
  const touch: TrackerCollaborationTouch = { ids: [], objects: [], moves: [], chains: [], restore: [], remove: [] };
  const chains = new Set<string>();
  nodes.refs.forEach((ref) => {
    const parent = nodes.parents.get(ref.id) ?? '';
    const baseline = replica.baselines.get(ref.id);
    const moved = baseline === undefined || baseline.state.parent !== parent;
    if (moved) trackerTouchMove(nodes, ref.object, parent, touch, chains);
    if (!moved && nodeFingerprint(ref, parent) === baseline?.fingerprint) return;
    if (baseline === undefined) touch.remove.push(ref.id);
    else touch.restore.push(ref.id);
    if (replica.mine(ref.id)) return;
    touch.ids.push(ref.id);
    touch.objects.push(ref.object);
  });
  replica.baselines.forEach((_baseline, id) => {
    if (nodes.get(id) !== undefined) return;
    touch.restore.push(id);
    if (!replica.mine(id)) touch.ids.push(id);
  });
  touch.chains = [...chains];
  return touch;
}

/**
 * Records a created or moved node and its new parent chain.
 *
 * @param nodes Node index.
 * @param object Moved object.
 * @param parent New parent id.
 * @param touch Receives the move.
 * @param chains Receives the chain ids.
 */
function trackerTouchMove(
  nodes: IndexCollaborationNodes,
  object: THREE.Object3D,
  parent: string,
  touch: TrackerCollaborationTouch,
  chains: Set<string>,
): void {
  touch.moves.push({ object, parent });
  hierarchyCollaborationChain((id) => nodes.parents.get(id), parent).forEach((id) => chains.add(id));
}

/**
 * Throws away every uncommitted change of a refused tool run: changed and
 * deleted nodes return to their agreed states, created nodes are removed.
 *
 * @param replica Scene replica.
 * @param touch Changes found before the refusal.
 * @returns Reverted ids.
 */
export function trackerCollaborationDiscard(
  replica: ReplicaCollaborationScene,
  touch: TrackerCollaborationTouch,
): string[] {
  const plan = { restore: new Set(touch.restore), remove: new Set(touch.remove), parents: new Set<string>() };
  const reverted = revertCollaborationApply(replica, plan);
  replica.applier.invalidate();
  return reverted;
}
