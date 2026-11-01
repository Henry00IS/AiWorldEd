import type * as THREE from 'three';
import {
  ApplierCollaborationNodes,
  type NodeCollaborationPose,
} from '@/collaboration/scene/node_collaboration_applier.js';
import { CodecCollaborationNodes, codecStateText } from '@/collaboration/scene/node_collaboration_codec.js';
import { nodeFingerprint, nodeFingerprintPose } from '@/collaboration/scene/node_collaboration_fingerprint.js';
import { orderKeysInitial } from '@/collaboration/scene/key_collaboration_order.js';
import type { IndexCollaborationNodes } from '@/collaboration/scene/node_collaboration_index.js';
import {
  NODE_PARENT_WORLD,
  type NodeCollaborationBaseline,
  type NodeCollaborationState,
} from '@/collaboration/scene/node_collaboration_types.js';
import {
  fieldCollaborationDiff,
  fieldCollaborationMerge,
  fieldCollaborationParse,
} from '@/collaboration/sync/field_collaboration_paths.js';
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
  /** Counts changes to the agreed states, so watchers can skip idle polls. */
  revision: number;
  private readonly previewed: Set<string>;
  private readonly pending: Map<number, Map<string, string[] | null>>;
  /**
   * Names of nodes with unacknowledged own changes that the last remote batch
   * deleted.
   */
  droppedOwn: string[];

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
    this.previewed = new Set();
    this.pending = new Map();
    this.droppedOwn = [];
    this.revision = 0;
  }

  /**
   * Remembers the fields an own edit changed until the relay acknowledges it.
   * Remote edits relayed before it must not overwrite those fields (the own
   * edit is later in relay order and wins).
   *
   * @param seq Edit sequence number.
   * @param ops Operations sent.
   */
  pendingAdd(seq: number, ops: readonly EditOperation[]): void {
    const fields = new Map<string, string[] | null>();
    ops.forEach((op) => {
      if (op.k === 'delete') return;
      const id = op.ids[0];
      if (id === undefined || (op.d as { live?: unknown } | undefined)?.live === 1) return;
      const parsed = op.k === 'create' ? null : fieldCollaborationParse((op.d as { f?: unknown } | undefined)?.f);
      const previous = fields.get(id);
      fields.set(id, previous === null || parsed === null ? null : [...(previous ?? []), ...parsed]);
    });
    if (fields.size > 0) this.pending.set(seq, fields);
  }

  /**
   * Forgets own edits up to a sequence number once the relay acknowledged it.
   *
   * @param seq Acknowledged sequence number.
   */
  pendingAck(seq: number): void {
    this.pending.forEach((_fields, pendingSeq) => {
      if (pendingSeq <= seq) this.pending.delete(pendingSeq);
    });
  }

  /**
   * Returns the own unacknowledged fields of a node.
   *
   * @param id Wire id.
   * @returns Paths, null when the whole node is pending, or an empty list.
   */
  private pendingFields(id: string): string[] | null {
    const paths: string[] = [];
    for (const fields of this.pending.values()) {
      if (!fields.has(id)) continue;
      const own = fields.get(id) ?? null;
      if (own === null) return null;
      paths.push(...own);
    }
    return paths;
  }

  /**
   * Returns whether local edits of a node are allowed: no other member's
   * running edit (lease) holds it. Selection never matters.
   *
   * @param id Wire id.
   * @returns True when the node may be changed locally.
   */
  mine(id: string): boolean {
    return !this.locks.heldByOther(id);
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
    this.revision += 1;
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
    this.revision += 1;
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
    this.previewed.clear();
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
    const agreed = (id: string): string | undefined => this.baselines.get(id)?.state.parent;
    const incoming = (op: EditOperation, state: NodeCollaborationState): NodeCollaborationState | null =>
      this.incoming(op, state);
    ops.forEach((op) => replicaOperationSort(op, upserts, deletes, poses, agreed, incoming));
    this.droppedOwn = this.droppedNames(deletes);
    const live = deletes.length === 0 && ops.every((op) => (op.d as { live?: unknown } | undefined)?.live === 1);
    const shown = live || ops.some((op) => op.ids.some((id) => this.previewed.has(id)));
    ops.forEach((op) => op.ids.forEach((id) => (live ? this.previewed.add(id) : this.previewed.delete(id))));
    return this.statesApply(upserts, deletes, poses, live, shown ? 'local' : 'agreed');
  }

  /**
   * Resolves the state a relayed change leaves a node in: field-level
   * last-writer-wins on top of the agreed state, keeping own fields the relay
   * has not acknowledged yet (they are later in relay order). Changes of nodes
   * this replica does not know (deleted meanwhile) are dropped, so a move never
   * resurrects a deleted node.
   *
   * @param op Relayed operation.
   * @param state Parsed state.
   * @returns State to apply, or null to drop the change.
   */
  private incoming(op: EditOperation, state: NodeCollaborationState): NodeCollaborationState | null {
    const baseline = this.baselines.get(state.id);
    if (op.k === 'create') return state;
    if (baseline === undefined) return null;
    if ((op.d as { live?: unknown } | undefined)?.live === 1) return state;
    const named = fieldCollaborationParse((op.d as { f?: unknown } | undefined)?.f);
    const own = this.pendingFields(state.id);
    if (named === null && own !== null && own.length === 0) return state;
    if (own === null) return null;
    const fields = named ?? fieldCollaborationDiff(baseline.state, state);
    if (fields === null) return state;
    const taken = fields.filter((path) => !own.some((mine) => path === mine || path.startsWith(`${mine}.`)));
    if (taken.length === 0) return null;
    const merged = fieldCollaborationMerge(baseline.state, state, taken);
    return own.length === 0 ? merged : fieldCollaborationMerge(merged, baseline.state, own);
  }

  /**
   * Returns the names of nodes with unacknowledged own changes that a remote
   * batch deletes.
   *
   * @param deletes Deleted ids.
   * @returns Object names (may be empty strings).
   */
  private droppedNames(deletes: readonly string[]): string[] {
    if (this.pending.size === 0 || deletes.length === 0) return [];
    const names: string[] = [];
    for (const id of deletes) {
      if (this.pendingFields(id)?.length === 0) continue;
      names.push(this.applier.nodes().get(id)?.object.name ?? '');
      if (names.length >= 8) break;
    }
    return names;
  }

  /**
   * Puts nodes that show another member's live preview back to their agreed
   * state, for when that member lets go of them without committing (they left
   * or dropped mid-drag).
   *
   * @param ids Ids whose remote lock ended.
   * @returns Ids changed.
   */
  previewRestore(ids: Iterable<string>): Set<string> {
    const states: NodeCollaborationState[] = [];
    for (const id of ids) {
      const baseline = this.baselines.get(id);
      if (!this.previewed.delete(id) || baseline === undefined) continue;
      states.push(baseline.state);
    }
    if (states.length === 0) return new Set();
    return this.statesApply(states, [], new Map(), false, 'local');
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
    this.baselinesRefresh(changed, live ? this.unknownOnly(staged) : staged);
    return changed;
  }

  /**
   * Keeps only states of nodes without an agreed state, so a live preview never
   * becomes the agreed state of a node the room already has.
   *
   * @param staged Applied states.
   * @returns States of nodes new to this replica.
   */
  private unknownOnly(staged: ReadonlyMap<string, NodeCollaborationState>): Map<string, NodeCollaborationState> {
    return new Map([...staged].filter(([id]) => !this.baselines.has(id)));
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
    // A key-only change (outliner reorder, its undo) moves no object between
    // parents, so the sibling order is enforced explicitly.
    if (this.baselines.get(state.id)?.state.key !== state.key) this.applier.orderTouch(state.parent);
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
    this.previewed.clear();
    this.pending.clear();
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
 * @param agreed Returns the agreed parent of a node, or undefined for new
 *   nodes.
 * @param incoming Resolves the state to apply (field merge), or null to drop.
 */
function replicaOperationSort(
  op: EditOperation,
  upserts: NodeCollaborationState[],
  deletes: string[],
  poses: Map<string, NodeCollaborationPose>,
  agreed: (id: string) => string | undefined,
  incoming: (op: EditOperation, state: NodeCollaborationState) => NodeCollaborationState | null,
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
  const parsed = stateCollaborationParse(payload?.s);
  if (parsed === null || parsed.id !== id) return;
  const state = incoming(op, parsed);
  if (state !== null && replicaParentBound(op, state, agreed(id))) upserts.push(state);
}

/**
 * Returns whether an upsert may place its node under its parent: a new or moved
 * node needs a create or reparent whose parent chain starts at that parent
 * (none for the world), so the relay checked the locks of the parent the
 * receivers actually use.
 *
 * @param op Operation.
 * @param state Parsed state.
 * @param agreed Agreed parent of the node, or undefined for a new node.
 * @returns True when the upsert is consistent with its parent chain.
 */
export function replicaParentBound(
  op: EditOperation,
  state: NodeCollaborationState,
  agreed: string | undefined,
): boolean {
  if (agreed === state.parent) return true;
  if (op.k !== 'create' && op.k !== 'reparent') return false;
  if (state.parent === NODE_PARENT_WORLD) return op.p === undefined || op.p.length === 0;
  return op.p?.[0] === state.parent;
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
