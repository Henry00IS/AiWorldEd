import type * as THREE from 'three';
import {
  ApplierCollaborationNodes,
  type NodeCollaborationPose,
} from '@/collaboration/scene/node_collaboration_applier.js';
import { CodecCollaborationNodes, codecStateText } from '@/collaboration/scene/node_collaboration_codec.js';
import { nodeFingerprint, nodeFingerprintPose } from '@/collaboration/scene/node_collaboration_fingerprint.js';
import { orderKeysInitial } from '@/collaboration/scene/key_collaboration_order.js';
import type { IndexCollaborationNodes } from '@/collaboration/scene/node_collaboration_index.js';
import type {
  NodeCollaborationBaseline,
  NodeCollaborationState,
} from '@/collaboration/scene/node_collaboration_types.js';
import { LockCollaborationTable } from '@/collaboration/sync/lock_collaboration_table.js';
import { stateCollaborationParse } from '@/collaboration/sync/state_collaboration_parse.js';
import type { EditOperation } from '@/collaboration/shared/protocol_definitions.js';

/**
 * How applying a state treats the node already in the scene: `agreed` patches
 * it when the agreed state has the same structure (remote edits), `local`
 * patches it when its current local content has the same structure (reverts and
 * undo, keeping object identity and selection), `rebuild` always replaces it
 * (new texture data).
 */
export type ReplicaCollaborationApplyMode = 'agreed' | 'local' | 'rebuild';

/**
 * Local replica of the room scene: the agreed state of every node (baseline),
 * the selection locks, and the applier that writes remote states into the
 * editor scene.
 */
export class ReplicaCollaborationScene {
  readonly world: THREE.Group;
  readonly applier: ApplierCollaborationNodes;
  readonly codec: CodecCollaborationNodes;
  readonly baselines: Map<string, NodeCollaborationBaseline>;
  readonly poses: Map<string, string>;
  readonly locks: LockCollaborationTable;

  /**
   * Creates a replica for a world root.
   *
   * @param world World group holding the editable scene.
   */
  constructor(world: THREE.Group) {
    this.world = world;
    this.applier = new ApplierCollaborationNodes(world);
    this.codec = new CodecCollaborationNodes();
    this.baselines = new Map();
    this.poses = new Map();
    this.locks = new LockCollaborationTable();
  }

  /**
   * Returns whether local edits of a node are allowed: it is locked by the
   * local user, or it is new and nobody else holds its id.
   *
   * @param id Wire id.
   * @returns True when the node may be changed locally.
   */
  mine(id: string): boolean {
    if (this.locks.heldBySelf(id)) return true;
    return !this.baselines.has(id) && !this.locks.heldByOther(id);
  }

  /**
   * Returns the agreed order key of a node.
   *
   * @param id Wire id.
   * @returns Key, or null for unknown nodes.
   */
  keyOf(id: string): string | null {
    return this.baselines.get(id)?.state.key ?? null;
  }

  /**
   * Records the agreed state of a node and its current fingerprint.
   *
   * @param state Agreed state.
   * @param nodes Current node index.
   */
  baselineSet(state: NodeCollaborationState, nodes: IndexCollaborationNodes): void {
    const ref = nodes.get(state.id);
    const fingerprint = ref === undefined ? '' : nodeFingerprint(ref, state.parent);
    this.baselines.set(state.id, { state, text: codecStateText(state), fingerprint });
    if (ref !== undefined) this.poses.set(state.id, nodeFingerprintPose(ref.object));
  }

  /**
   * Drops the agreed state of a node.
   *
   * @param id Wire id.
   */
  baselineDelete(id: string): void {
    this.baselines.delete(id);
    this.poses.delete(id);
  }

  /** Adopts the current scene as the agreed room state (room creator). */
  baselineInitialize(): void {
    this.baselines.clear();
    this.poses.clear();
    this.applier.invalidate();
    const nodes = this.applier.nodes();
    const keys = new Map<string, string>();
    replicaSiblings(nodes).forEach((ids) => {
      const fresh = orderKeysInitial(ids.length);
      ids.forEach((id, index) => keys.set(id, fresh[index] ?? ''));
    });
    nodes.refs.forEach((ref) => {
      const state = this.codec.encode(ref, nodes.parents.get(ref.id) ?? '', keys.get(ref.id) ?? '');
      if (state !== null) this.baselineSet(state, nodes);
    });
  }

  /**
   * Returns every agreed state in depth-first scene order (parents first).
   *
   * @returns Agreed states.
   */
  snapshotStates(): NodeCollaborationState[] {
    this.applier.invalidate();
    const states: NodeCollaborationState[] = [];
    this.applier.nodes().refs.forEach((ref) => {
      const baseline = this.baselines.get(ref.id);
      if (baseline !== undefined) states.push(baseline.state);
    });
    return states;
  }

  /**
   * Replaces the scene with a snapshot of the room (joiner).
   *
   * @param states Agreed states, parents first.
   * @returns Ids applied.
   */
  snapshotApply(states: readonly NodeCollaborationState[]): Set<string> {
    this.baselines.clear();
    this.poses.clear();
    this.applier.clearScene();
    return this.statesApply(states, [], new Map(), false);
  }

  /**
   * Applies relayed edit operations from another member.
   *
   * @param ops Operations in relay order.
   * @returns Ids changed by the operations.
   */
  remoteApply(ops: readonly EditOperation[]): Set<string> {
    const upserts: NodeCollaborationState[] = [];
    const deletes: string[] = [];
    const poses = new Map<string, NodeCollaborationPose>();
    ops.forEach((op) => replicaOperationSort(op, upserts, deletes, poses));
    const live = upserts.length === 0 && deletes.length === 0;
    return this.statesApply(upserts, deletes, poses, live);
  }

  /**
   * Writes states into the scene (used for remote edits, reverts and undo).
   *
   * @param upserts States to apply, parents first.
   * @param deletes Ids to remove.
   * @param poses Live poses to apply.
   * @param live True for cheap interactive rebuilds.
   * @param mode How existing nodes are compared before patching them.
   * @returns Ids changed.
   */
  statesApply(
    upserts: readonly NodeCollaborationState[],
    deletes: readonly string[],
    poses: ReadonlyMap<string, NodeCollaborationPose>,
    live: boolean,
    mode: ReplicaCollaborationApplyMode = 'agreed',
  ): Set<string> {
    const staged = new Map<string, NodeCollaborationState>();
    upserts.forEach((state) => {
      if (this.stateApply(state, mode)) staged.set(state.id, state);
    });
    poses.forEach((pose, id) => this.applier.pose(id, pose));
    deletes.forEach((id) => this.applier.remove(id));
    const keyOf = (id: string): string | null => staged.get(id)?.key ?? this.keyOf(id);
    const changed = this.applier.finish(keyOf, live);
    this.baselinesRefresh(changed, staged);
    return changed;
  }

  /**
   * Applies one state, ignoring payloads the editor cannot decode.
   *
   * @param state State to apply.
   * @param mode How the existing node is compared.
   * @returns True when the node exists afterwards.
   */
  private stateApply(state: NodeCollaborationState, mode: ReplicaCollaborationApplyMode): boolean {
    const previous = this.statePrevious(state, mode);
    try {
      return this.applier.upsert(state, previous);
    } catch (error) {
      console.warn('[collaboration] state could not be applied', state.id, error);
      return false;
    }
  }

  /**
   * Returns the state the existing node is compared with: the agreed state, the
   * node as it is now (local edits included), or nothing to force a rebuild.
   *
   * @param state State about to be applied.
   * @param mode Comparison mode.
   * @returns Previous state, or null to rebuild.
   */
  private statePrevious(
    state: NodeCollaborationState,
    mode: ReplicaCollaborationApplyMode,
  ): NodeCollaborationState | null {
    if (mode === 'rebuild') return null;
    if (mode === 'agreed') return this.baselines.get(state.id)?.state ?? null;
    const nodes = this.applier.nodes();
    const ref = nodes.get(state.id);
    if (ref === undefined) return null;
    try {
      return this.codec.encode(ref, nodes.parents.get(state.id) ?? '', state.key);
    } catch {
      return null;
    }
  }

  /**
   * Refreshes baselines of changed nodes after a batch.
   *
   * @param changed Ids touched by the batch.
   * @param staged New agreed states by id.
   */
  private baselinesRefresh(changed: ReadonlySet<string>, staged: ReadonlyMap<string, NodeCollaborationState>): void {
    const nodes = this.applier.nodes();
    changed.forEach((id) => {
      const state = staged.get(id) ?? this.baselines.get(id)?.state;
      if (nodes.get(id) === undefined || state === undefined) this.baselineDelete(id);
      else this.baselineSet(state, nodes);
    });
  }

  /** Forgets every agreed state and lock. */
  clear(): void {
    this.baselines.clear();
    this.poses.clear();
    this.locks.clear();
    this.applier.invalidate();
  }
}

/**
 * Groups node ids by parent in scene order.
 *
 * @param nodes Node index.
 * @returns Child ids per parent id.
 */
export function replicaSiblings(nodes: IndexCollaborationNodes): Map<string, string[]> {
  const siblings = new Map<string, string[]>();
  nodes.refs.forEach((ref) => {
    const parent = nodes.parents.get(ref.id) ?? '';
    const list = siblings.get(parent);
    if (list === undefined) siblings.set(parent, [ref.id]);
    else list.push(ref.id);
  });
  return siblings;
}

/**
 * Sorts one relayed operation into upserts, deletes and live poses. Invalid
 * operations are ignored.
 *
 * @param op Relayed operation.
 * @param upserts Receives states.
 * @param deletes Receives deleted ids.
 * @param poses Receives live poses.
 */
function replicaOperationSort(
  op: EditOperation,
  upserts: NodeCollaborationState[],
  deletes: string[],
  poses: Map<string, NodeCollaborationPose>,
): void {
  const id = op.ids[0];
  if (id === undefined) return;
  if (op.k === 'delete') {
    deletes.push(...op.ids);
    return;
  }
  const payload = op.d as { s?: unknown; t?: unknown } | undefined;
  const pose = replicaPoseParse(payload?.t);
  if (pose !== null) poses.set(id, pose);
  const state = stateCollaborationParse(payload?.s);
  if (state !== null && state.id === id) upserts.push(state);
}

/**
 * Parses a live pose array.
 *
 * @param value Candidate pose.
 * @returns Pose, or null when invalid.
 */
function replicaPoseParse(value: unknown): NodeCollaborationPose | null {
  if (!Array.isArray(value) || value.length !== 10) return null;
  if (!value.every((item) => typeof item === 'number' && Number.isFinite(item))) return null;
  return value as NodeCollaborationPose;
}
