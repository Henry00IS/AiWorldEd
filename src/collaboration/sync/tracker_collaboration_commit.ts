import * as THREE from 'three';
import { codecStateText } from '@/collaboration/scene/node_collaboration_codec.js';
import { nodeFingerprint } from '@/collaboration/scene/node_collaboration_fingerprint.js';
import type { IndexCollaborationNodes } from '@/collaboration/scene/node_collaboration_index.js';
import type { NodeCollaborationRef, NodeCollaborationState } from '@/collaboration/scene/node_collaboration_types.js';
import { keysCollaborationAssign } from '@/collaboration/sync/keys_collaboration_assign.js';
import { replicaSiblings, type ReplicaCollaborationScene } from '@/collaboration/sync/replica_collaboration_scene.js';
import {
  revertCollaborationApply,
  type RevertCollaborationPlan,
} from '@/collaboration/sync/revert_collaboration_apply.js';
import type { EditOperation } from '@/collaboration/shared/protocol_definitions.js';

/** One node change recorded for per-user undo. */
export interface TrackerCollaborationChange {
  id: string;
  before: NodeCollaborationState | null;
  after: NodeCollaborationState | null;
}

/** Outcome of one commit. */
export interface TrackerCollaborationCommit {
  ops: EditOperation[];
  changes: TrackerCollaborationChange[];
  created: string[];
  reverted: string[];
  oversized: string[];
}

/**
 * Meshes above this vertex count are re-encoded only after a command or a
 * fingerprint change.
 */
export const TRACKER_HEAVY_VERTEX_COUNT = 20000;

/**
 * Detects local changes by diffing the scene against the agreed baselines: held
 * nodes become edit operations, changes to nodes the local user does not hold
 * are reverted.
 */
export class TrackerCollaboration {
  private readonly replica: ReplicaCollaborationScene;
  private readonly opBytesMaximum: number;
  private dirty: boolean;
  readonly historyBase: Map<string, NodeCollaborationState | null>;

  /**
   * Creates a tracker.
   *
   * @param replica Scene replica.
   * @param opBytesMaximum Largest encoded state that fits one relay message.
   */
  constructor(replica: ReplicaCollaborationScene, opBytesMaximum: number) {
    this.replica = replica;
    this.opBytesMaximum = opBytesMaximum;
    this.dirty = false;
    this.historyBase = new Map();
  }

  /** Marks that a command ran, forcing heavy held meshes to be re-encoded. */
  markDirty(): void {
    this.dirty = true;
  }

  /**
   * Diffs the scene against the baselines and returns the edit to send.
   *
   * @returns Operations, undo changes and reverted ids.
   */
  commit(): TrackerCollaborationCommit {
    const replica = this.replica;
    replica.applier.invalidate();
    const nodes = replica.applier.nodes();
    const plan: RevertCollaborationPlan = { restore: new Set(), remove: new Set(), parents: new Set() };
    const keys = this.keysAssign(nodes, plan);
    const upserts = this.upsertsCollect(nodes, keys, plan);
    const deletes = this.deletesCollect(nodes, plan);
    const oversized = this.oversizedFilter(upserts, plan);
    this.dirty = false;
    const result = this.resultBuild(upserts, deletes, oversized);
    result.reverted.push(...revertCollaborationApply(replica, plan));
    return result;
  }

  /**
   * Assigns order keys to every sibling list.
   *
   * @param nodes Current node index.
   * @param plan Receives parents whose fixed children are out of order.
   * @returns Keys by id.
   */
  private keysAssign(nodes: IndexCollaborationNodes, plan: RevertCollaborationPlan): Map<string, string> {
    const keys = new Map<string, string>();
    replicaSiblings(nodes).forEach((ids, parent) => {
      const siblings = ids
        .filter((id) => this.replica.mine(id) || this.replica.baselines.get(id)?.state.parent === parent)
        .map((id) => ({ id, fixed: !this.replica.mine(id), previousKey: this.previousKey(id, parent) }));
      const result = keysCollaborationAssign(siblings);
      if (result.violated) plan.parents.add(parent);
      result.keys.forEach((key, id) => keys.set(id, key));
    });
    return keys;
  }

  /**
   * Returns the agreed key of a node when it still has the same parent.
   *
   * @param id Wire id.
   * @param parent Current parent id.
   * @returns Key, or null.
   */
  private previousKey(id: string, parent: string): string | null {
    const baseline = this.replica.baselines.get(id);
    return baseline !== undefined && baseline.state.parent === parent ? baseline.state.key : null;
  }

  /**
   * Encodes changed held nodes and plans reverts for changed unheld nodes.
   *
   * @param nodes Current node index.
   * @param keys Assigned keys.
   * @param plan Revert plan.
   * @returns Changed states in depth-first order.
   */
  private upsertsCollect(
    nodes: IndexCollaborationNodes,
    keys: ReadonlyMap<string, string>,
    plan: RevertCollaborationPlan,
  ): NodeCollaborationState[] {
    const upserts: NodeCollaborationState[] = [];
    nodes.refs.forEach((ref) => {
      const parent = nodes.parents.get(ref.id) ?? '';
      if (!this.replica.mine(ref.id)) return this.unheldCheck(ref, parent, plan);
      const state = this.heldEncode(ref, parent, keys.get(ref.id) ?? '');
      if (state !== null) upserts.push(state);
    });
    return upserts;
  }

  /**
   * Encodes a held node when it differs from its baseline.
   *
   * @param ref Node.
   * @param parent Parent id.
   * @param key Assigned key.
   * @returns Changed state, or null when unchanged.
   */
  private heldEncode(ref: NodeCollaborationRef, parent: string, key: string): NodeCollaborationState | null {
    const baseline = this.replica.baselines.get(ref.id);
    if (baseline !== undefined && !this.dirty && trackerHeavy(ref.object)) {
      const same = baseline.state.parent === parent && baseline.state.key === key;
      if (same && nodeFingerprint(ref, parent) === baseline.fingerprint) return null;
    }
    const state = this.replica.codec.encode(ref, parent, key);
    if (state === null || (baseline !== undefined && codecStateText(state) === baseline.text)) return null;
    return state;
  }

  /**
   * Plans a revert when a node held by nobody local changed.
   *
   * @param ref Node.
   * @param parent Current parent id.
   * @param plan Revert plan.
   */
  private unheldCheck(ref: NodeCollaborationRef, parent: string, plan: RevertCollaborationPlan): void {
    const baseline = this.replica.baselines.get(ref.id);
    if (baseline === undefined) {
      plan.remove.add(ref.id);
      return;
    }
    if (baseline.state.parent !== parent || nodeFingerprint(ref, parent) !== baseline.fingerprint) {
      plan.restore.add(ref.id);
    }
  }

  /**
   * Collects deleted held nodes; deleted unheld nodes are restored.
   *
   * @param nodes Current node index.
   * @param plan Revert plan.
   * @returns Deleted ids.
   */
  private deletesCollect(nodes: IndexCollaborationNodes, plan: RevertCollaborationPlan): string[] {
    const missing: string[] = [];
    this.replica.baselines.forEach((_baseline, id) => {
      if (nodes.get(id) === undefined) missing.push(id);
    });
    if (missing.length === 0) return [];
    const blocked = this.deletesBlocked(missing);
    const deletes: string[] = [];
    missing.forEach((id) => {
      if (blocked.has(id)) plan.restore.add(id);
      else deletes.push(id);
    });
    return deletes;
  }

  /**
   * Returns missing ids that must be restored: unheld nodes and the ancestors
   * of restored nodes.
   *
   * @param missing Ids missing from the scene.
   * @returns Ids to restore.
   */
  private deletesBlocked(missing: readonly string[]): Set<string> {
    const missingSet = new Set(missing);
    const blocked = new Set<string>();
    missing.forEach((id) => {
      if (this.replica.mine(id)) return;
      let current: string | undefined = id;
      while (current !== undefined && missingSet.has(current) && !blocked.has(current)) {
        blocked.add(current);
        current = this.replica.baselines.get(current)?.state.parent;
      }
    });
    return blocked;
  }

  /**
   * Removes states that exceed the relay message size and plans their revert.
   *
   * @param upserts Changed states; oversized entries are removed in place.
   * @param plan Revert plan.
   * @returns Oversized ids.
   */
  private oversizedFilter(upserts: NodeCollaborationState[], plan: RevertCollaborationPlan): string[] {
    const oversized: string[] = [];
    for (let index = upserts.length - 1; index >= 0; index--) {
      const state = upserts[index];
      if (state === undefined || codecStateText(state).length <= this.opBytesMaximum) continue;
      oversized.push(state.id);
      upserts.splice(index, 1);
      if (this.replica.baselines.has(state.id)) plan.restore.add(state.id);
      else plan.remove.add(state.id);
    }
    return oversized;
  }

  /**
   * Turns accepted changes into operations, history changes and baselines.
   *
   * @param upserts Changed states.
   * @param deletes Deleted ids.
   * @param oversized Ids too large to send.
   * @returns Commit result.
   */
  private resultBuild(
    upserts: readonly NodeCollaborationState[],
    deletes: readonly string[],
    oversized: string[],
  ): TrackerCollaborationCommit {
    const nodes = this.replica.applier.nodes();
    const result: TrackerCollaborationCommit = { ops: [], changes: [], created: [], reverted: [], oversized };
    upserts.forEach((state) => {
      const baseline = this.replica.baselines.get(state.id);
      const kind = baseline === undefined ? 'create' : baseline.state.parent !== state.parent ? 'reparent' : 'property';
      if (baseline === undefined) result.created.push(state.id);
      result.ops.push({ k: kind, ids: [state.id], d: { s: state } });
      result.changes.push({ id: state.id, before: this.historyTake(state.id, baseline?.state ?? null), after: state });
      this.replica.baselineSet(state, nodes);
    });
    deletes.forEach((id) => {
      result.ops.push({ k: 'delete', ids: [id] });
      result.changes.push({
        id,
        before: this.historyTake(id, this.replica.baselines.get(id)?.state ?? null),
        after: null,
      });
      this.replica.baselineDelete(id);
    });
    return result;
  }

  /**
   * Returns the state before the first uncommitted change of a node.
   *
   * @param id Wire id.
   * @param fallback Current baseline state.
   * @returns Before state.
   */
  private historyTake(id: string, fallback: NodeCollaborationState | null): NodeCollaborationState | null {
    const before = this.historyBase.has(id) ? (this.historyBase.get(id) ?? null) : fallback;
    this.historyBase.delete(id);
    return before;
  }
}

/**
 * Returns whether an object is a heavy mesh.
 *
 * @param object Scene object.
 * @returns True above the heavy vertex threshold.
 */
function trackerHeavy(object: THREE.Object3D): boolean {
  if (!(object instanceof THREE.Mesh)) return false;
  const position = (object.geometry as THREE.BufferGeometry).getAttribute('position');
  return position !== undefined && position.count > TRACKER_HEAVY_VERTEX_COUNT;
}
