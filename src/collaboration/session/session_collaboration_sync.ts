import type { HostCollaborationEditor } from '@/collaboration/host/host_collaboration_editor.js';
import type { NodeCollaborationState } from '@/collaboration/scene/node_collaboration_types.js';
import type { SessionCollaborationTransport } from '@/collaboration/session/session_collaboration_types.js';
import {
  EditCollaborationOutbox,
  editCollaborationRevert,
  type EditCollaborationMessage,
} from '@/collaboration/sync/edit_collaboration_outbox.js';
import {
  HISTORY_COLLABORATION_LIMIT,
  HistoryCollaborationStack,
  type HistoryCollaborationEntry,
} from '@/collaboration/sync/history_collaboration_stack.js';
import { GateCollaborationEdits } from '@/collaboration/sync/gate_collaboration_edits.js';
import {
  hierarchyCollaborationBlock,
  hierarchyCollaborationChain,
  hierarchyCollaborationShared,
  hierarchyCollaborationSubtree,
} from '@/collaboration/sync/hierarchy_collaboration_locks.js';
import {
  LeaseCollaborationClient,
  type LeaseCollaborationOutcome,
} from '@/collaboration/sync/lease_collaboration_client.js';
import { LiveCollaborationTicker } from '@/collaboration/sync/live_collaboration_ticker.js';
import { ReplicaCollaborationScene } from '@/collaboration/sync/replica_collaboration_scene.js';
import {
  TrackerCollaboration,
  type TrackerCollaborationChange,
  type TrackerCollaborationCommit,
  type TrackerCollaborationRefusal,
} from '@/collaboration/sync/tracker_collaboration_commit.js';
import {
  verifyCollaborationIds,
  verifyCollaborationReason,
  verifyCollaborationVerdict,
} from '@/collaboration/sync/verify_collaboration_verdict.js';
import type { SocketCollaborationMessage } from '@/collaboration/net/socket_collaboration_types.js';
import type { EditOperation } from '@/collaboration/shared/protocol_definitions.js';

/** Relayed edit from another member. */
export interface SyncCollaborationRemoteEdit {
  from: number;
  seq: number;
  ops: EditOperation[];
}

/** Largest share of the payload limit one operation may use. */
const SYNC_COLLABORATION_OP_SHARE = 0.75;

/**
 * How long after the last live change an operation counts as running without a
 * pressed pointer (keyboard grabs like G/R/S move objects with no button
 * down).
 */
export const SYNC_COLLABORATION_ACTIVE_MS = 400;

/** Why a running operation must stop. */
export interface SyncCollaborationLeaseEvent {
  /**
   * `refused`: the relay (or the local lease table) refused the operation;
   * `expired`: the relay ended the lease; `hidden`: the tab was hidden
   * mid-edit.
   */
  kind: 'refused' | 'expired' | 'hidden';
  /**
   * Relay code (`lock_conflict`, `rate_limited`, ...), or `local` for the local
   * pre-check.
   */
  code: string;
  /** Ids the operation edits. */
  ids: string[];
  /** Untrusted conflict list of a refusal. */
  conflicts: unknown;
  /** Detail of a `lock_unverified` refusal. */
  why: string;
  /** Node another member holds that blocked the operation, when known locally. */
  blocker: { id: string; holder: number } | null;
}

/** Returns a monotonic time in milliseconds. */
function syncCollaborationNow(): number {
  return performance.now();
}

/**
 * Edit loop of a room: commits local changes as edits, applies remote edits in
 * relay order, buffers remote edits until the scene is synchronized, streams
 * live transforms, and reverts edits the relay rejects.
 */
export class SyncCollaborationSession {
  readonly replica: ReplicaCollaborationScene;
  readonly tracker: TrackerCollaboration;
  readonly history: HistoryCollaborationStack;
  private readonly host: HostCollaborationEditor;
  private readonly transport: SessionCollaborationTransport;
  private readonly ticker: LiveCollaborationTicker;
  private readonly outbox: EditCollaborationOutbox;
  readonly lease: LeaseCollaborationClient;
  private readonly gate: GateCollaborationEdits;
  private inputActive: () => boolean;
  private leaseListener: ((event: SyncCollaborationLeaseEvent) => void) | null;
  private memberName: (user: number) => string;
  private liveAt: number;
  /** An explicitly held operation ({@link operationHold}) keeps its lease. */
  private holding: boolean;
  private liveSuppressed: boolean;
  private readonly buffered: SyncCollaborationRemoteEdit[];
  private synced: boolean;
  private held: boolean;
  private rejections: number;
  private rejectionReason: string;
  private hierarchyListener: (() => void) | null;
  private refusalNames: (refusal: TrackerCollaborationRefusal) => string;

  /**
   * Creates the edit loop.
   *
   * @param host Editor services.
   * @param transport Relay connection.
   */
  constructor(host: HostCollaborationEditor, transport: SessionCollaborationTransport) {
    const limits = transport.limits;
    this.host = host;
    this.transport = transport;
    this.replica = new ReplicaCollaborationScene(host.world);
    this.tracker = new TrackerCollaboration(
      this.replica,
      Math.floor(limits.maxPayloadBytes * SYNC_COLLABORATION_OP_SHARE),
    );
    this.history = new HistoryCollaborationStack(HISTORY_COLLABORATION_LIMIT, () => host.commandStack.notifyChanged());
    this.ticker = new LiveCollaborationTicker(this.replica, this.tracker);
    this.outbox = new EditCollaborationOutbox(limits.opsPerEdit);
    this.gate = new GateCollaborationEdits((message) => transport.send(message), syncCollaborationNow);
    this.lease = new LeaseCollaborationClient({
      request: (message) => transport.request(message),
      send: (message) => this.gate.send(message, 0),
    });
    this.inputActive = () => false;
    this.leaseListener = null;
    this.memberName = () => 'Another member';
    this.liveAt = -Infinity;
    this.holding = false;
    this.liveSuppressed = false;
    this.buffered = [];
    this.synced = false;
    this.held = false;
    this.rejections = 0;
    this.rejectionReason = '';
    this.hierarchyListener = null;
    this.refusalNames = () => 'This change touches a container another member is editing; it was reverted';
  }

  /**
   * Sets the listener told when sent creates or moves changed the hierarchy.
   *
   * @param listener Listener, or null.
   */
  hierarchyListenerSet(listener: (() => void) | null): void {
    this.hierarchyListener = listener;
  }

  /**
   * Sets the probe telling whether the user is pressing a pointer.
   *
   * @param probe Returns true while a pointer button is down.
   */
  inputProbeSet(probe: () => boolean): void {
    this.inputActive = probe;
  }

  /** A new pointer press retries a refused operation at once (no backoff). */
  pressed(): void {
    this.lease.retryNow();
  }

  /**
   * Returns whether the user is pressing a pointer.
   *
   * @returns True while a pointer button is down.
   */
  pressing(): boolean {
    return this.inputActive();
  }

  /**
   * Sets the listener told when a running operation must be cancelled.
   *
   * @param listener Listener, or null.
   */
  leaseListenerSet(listener: ((event: SyncCollaborationLeaseEvent) => void) | null): void {
    this.leaseListener = listener;
  }

  /**
   * Sets how member names are looked up for notices.
   *
   * @param nameOf Returns a member's display name.
   */
  memberNameSet(nameOf: (user: number) => string): void {
    this.memberName = nameOf;
  }

  /**
   * Sets how refused creates and moves are described to the user.
   *
   * @param describe Builds the status message of a refusal.
   */
  refusalDescriberSet(describe: (refusal: TrackerCollaborationRefusal) => string): void {
    this.refusalNames = describe;
  }

  /**
   * Returns whether the scene is synchronized with the room.
   *
   * @returns True once editing is allowed.
   */
  isSynced(): boolean {
    return this.synced;
  }

  /**
   * Defers commits while a tool runs, so its changes can be locked before they
   * are diffed; changes made meanwhile join the same edit.
   *
   * @param held True to defer commits.
   */
  holdSet(held: boolean): void {
    this.held = held;
  }

  /**
   * Returns how many edits the relay rejected so far and the last reason.
   *
   * @returns Rejection count and reason code.
   */
  rejectionState(): { count: number; reason: string } {
    return { count: this.rejections, reason: this.rejectionReason };
  }

  /**
   * Resolves once the relay processed every edit sent so far; rejections of
   * those edits arrive before.
   *
   * @returns Resolves true when the relay answered.
   */
  settled(): Promise<boolean> {
    return this.transport
      .request({ t: 'ping' })
      .then(() => true)
      .catch(() => false);
  }

  /** Starts as the room owner: the local scene becomes the room scene. */
  ownerStart(): void {
    this.replica.baselineInitialize();
    this.synced = true;
  }

  /**
   * Replaces the scene with the owner's snapshot and replays buffered edits.
   *
   * @param states Snapshot node states.
   */
  snapshotApply(states: readonly NodeCollaborationState[]): void {
    this.replica.snapshotApply(states);
    this.synced = true;
    const pending = this.buffered.splice(0, this.buffered.length);
    pending.forEach((edit) => this.replica.remoteApply(edit.ops));
    this.host.refresh();
  }

  /**
   * Diffs the scene and sends local changes. Changes to nodes the user does not
   * hold are reverted.
   *
   * @returns Commit result, or null before synchronization.
   */
  commit(): TrackerCollaborationCommit | null {
    if (!this.synced || this.held) return null;
    const streamed = this.ticker.streamedIds();
    const result = this.tracker.commit();
    this.ticker.reset();
    this.liveSuppressed = false;
    if (result.created.length > 0) this.replica.locks.requestAdd(result.created);
    if (result.ops.length > 0) this.editSend(result.ops, result.changes, true);
    this.streamSettle(streamed, result.ops);
    this.commitReport(result);
    if (syncCollaborationHierarchy(result.ops)) this.hierarchyListener?.();
    return result;
  }

  /**
   * Re-sends the agreed state of nodes that streamed live poses or shapes but
   * ended where they started (a cancelled drag), so receivers drop the streamed
   * preview instead of keeping it.
   *
   * @param streamed Ids streamed since the previous commit.
   * @param sent Operations the commit sent.
   */
  private streamSettle(streamed: readonly string[], sent: readonly EditOperation[]): void {
    const covered = new Set(sent.flatMap((op) => op.ids));
    const ops: EditOperation[] = [];
    streamed.forEach((id) => {
      const baseline = this.replica.baselines.get(id);
      if (covered.has(id) || !this.replica.mine(id) || baseline === undefined) return;
      this.tracker.historyBase.delete(id);
      ops.push({ k: 'transform', ids: [id], d: { s: baseline.state } });
    });
    if (ops.length > 0) this.editSend(ops, [], false);
  }

  /**
   * Broadcasts live transforms and edit-mode shapes of the running operation.
   * The first live change of an operation asks the relay for its lease; until
   * it is granted the change stays a local preview, and a refusal cancels the
   * tool. Renews the lease while input is active.
   */
  liveTick(): void {
    if (!this.synced || this.held) return;
    const now = syncCollaborationNow();
    const ops = this.ticker.collect(this.transport.limits.opsPerEdit);
    if (ops.length > 0) {
      this.liveAt = now;
      const ids = [...new Set(ops.flatMap((op) => op.ids))];
      if (this.lease.covers(ids) && !this.gate.busy()) {
        this.editSend(ops, [], false, true);
        this.lease.progressed(now);
      } else {
        this.ticker.unsend(ids);
        if (!this.lease.asks(ids)) this.operationStart(ids, now);
      }
    }
    if (this.active(now)) this.lease.renew(now);
  }

  /**
   * Returns whether the running operation still has input.
   *
   * @param now Monotonic time.
   * @returns True while a pointer is down or live changes are recent.
   */
  private active(now: number): boolean {
    return this.holding || this.inputActive() || now - this.liveAt < SYNC_COLLABORATION_ACTIVE_MS;
  }

  /**
   * Starts an operation over the subtrees of edited ids: refuses at once when
   * the local lease table shows another member editing them (no request), else
   * asks the relay and keeps the change as a local preview meanwhile.
   *
   * @param ids Ids with live changes.
   * @param now Monotonic time.
   */
  private operationStart(ids: readonly string[], now: number): void {
    if (this.liveSuppressed || this.gate.busy() || !this.lease.retryAllowed(now)) return;
    const parents = this.replica.applier.nodes().parents;
    const subtree = hierarchyCollaborationSubtree(parents, ids);
    const exclusive = new Set(subtree);
    const shared = hierarchyCollaborationShared(parents, exclusive);
    const blocker = hierarchyCollaborationBlock(this.replica.locks, [...subtree, ...shared]);
    if (blocker !== null) {
      this.leaseCancel({ kind: 'refused', code: 'local', ids: [...ids], conflicts: [], why: '', blocker });
      return;
    }
    this.lease
      .acquire(subtree, shared, this.transport.limits.idsPerMessage, now)
      .then((outcome) => this.leaseOutcome(outcome, ids))
      .catch(() => undefined);
  }

  /**
   * Holds the operation lease over the subtrees of ids for a whole multi-step
   * operation (a geometry-reading tool, a scripted edit): resolves with the
   * relay's answer; the lease stays until {@link leaseIdle} sees no input, an
   * explicit release, or the relay's expiry.
   *
   * @param ids Node ids the operation edits.
   * @returns Relay answer (a local refusal names no conflicts).
   */
  operationHold(ids: readonly string[]): Promise<LeaseCollaborationOutcome> {
    return this.operationHoldTry(ids, 1);
  }

  /**
   * Asks for the operation lease; a refutation of the claimed containers (the
   * hierarchy changed in flight) is asked again with a fresh chain.
   *
   * @param ids Node ids the operation edits.
   * @param retries Refutations still retried.
   * @returns Relay answer.
   */
  private operationHoldTry(ids: readonly string[], retries: number): Promise<LeaseCollaborationOutcome> {
    const now = syncCollaborationNow();
    const parents = this.replica.applier.nodes().parents;
    const subtree = hierarchyCollaborationSubtree(parents, ids);
    const shared = hierarchyCollaborationShared(parents, new Set(subtree));
    const blocker = hierarchyCollaborationBlock(this.replica.locks, [...subtree, ...shared]);
    if (blocker !== null) {
      this.leaseCancel({ kind: 'refused', code: 'local', ids: [...ids], conflicts: [], why: '', blocker });
      return Promise.resolve({ ok: false, lease: this.lease.lease(), code: 'lease_busy', conflicts: [], why: '' });
    }
    this.liveAt = now;
    this.holding = true;
    return this.lease.acquire(subtree, shared, this.transport.limits.idsPerMessage, now).then((outcome) => {
      if (outcome.ok) return outcome;
      this.holding = false;
      if (retries > 0 && outcome.code === 'lock_unverified' && outcome.why === 'invalid') {
        this.replica.applier.invalidate();
        return this.operationHoldTry(ids, retries - 1);
      }
      this.leaseOutcome(outcome, ids);
      return outcome;
    });
  }

  /**
   * Returns whether this member's granted lease covers an id (the own lease is
   * kept by the lease client, not in the shared lock table).
   *
   * @param id Node id.
   * @returns True while the running operation may edit it.
   */
  leaseHolds(id: string): boolean {
    return this.lease.covers([id]);
  }

  /**
   * Returns whether an operation lease is running or being asked for.
   *
   * @returns True unless no operation runs.
   */
  leaseRunning(): boolean {
    return this.lease.state() !== 'none';
  }

  /** Ends the running operation now (explicit release). */
  operationRelease(): void {
    this.holding = false;
    this.liveAt = -Infinity;
    this.commit();
    this.lease.release();
  }

  /**
   * Applies the relay's answer to an operation start.
   *
   * @param outcome Answer.
   * @param ids Ids with live changes.
   */
  private leaseOutcome(outcome: LeaseCollaborationOutcome, ids: readonly string[]): void {
    if (!this.synced || outcome.lease !== this.lease.lease()) return;
    if (outcome.ok) return;
    if (outcome.code === 'lock_limit') {
      this.liveSuppressed = true;
      return;
    }
    if (outcome.code === 'lock_unverified' && this.inputActive()) return;
    const parentOf = (id: string): string | undefined => this.replica.applier.nodes().parents.get(id);
    const blocker = hierarchyCollaborationBlock(this.replica.locks, [
      ...ids,
      ...ids.flatMap((id) => hierarchyCollaborationChain(parentOf, parentOf(id) ?? '')),
    ]);
    this.leaseCancel({
      kind: 'refused',
      code: outcome.code,
      ids: [...ids],
      conflicts: outcome.conflicts,
      why: outcome.why,
      blocker,
    });
  }

  /**
   * Cancels the running operation: drops its local preview and tells the
   * listener, which cancels the tool and names the holder.
   *
   * @param event Why.
   */
  private leaseCancel(event: SyncCollaborationLeaseEvent): void {
    this.ticker.unsend(event.ids);
    this.leaseListener?.(event);
  }

  /**
   * Puts nodes back to their agreed state (a cancelled operation's preview).
   *
   * @param ids Ids.
   */
  previewDrop(ids: readonly string[]): void {
    const states: NodeCollaborationState[] = [];
    ids.forEach((id) => {
      const baseline = this.replica.baselines.get(id);
      this.tracker.historyBase.delete(id);
      if (baseline !== undefined) states.push(baseline.state);
    });
    if (states.length === 0) return;
    this.replica.statesApply(states, [], new Map(), false, 'local');
    this.host.refresh();
  }

  /** Releases the lease once the operation has no input any more (poll). */
  leaseIdle(): void {
    if (this.lease.state() === 'none' || this.active(syncCollaborationNow())) return;
    this.lease.release();
  }

  /** The relay expired the own lease: the operation ends here too. */
  leaseExpired(): void {
    if (this.lease.state() === 'none') return;
    const running = this.active(syncCollaborationNow());
    this.holding = false;
    this.lease.expired();
    if (!running) return;
    const ids = [...this.replica.locks.requestedIds()];
    this.leaseCancel({ kind: 'expired', code: 'lease_expired', ids, conflicts: [], why: '', blocker: null });
  }

  /** The tab was hidden: cancels a running operation, commits and releases. */
  hidden(): void {
    if (!this.synced) return;
    if (this.lease.state() !== 'none' || this.active(syncCollaborationNow())) {
      this.leaseListener?.({ kind: 'hidden', code: 'hidden', ids: [], conflicts: [], why: '', blocker: null });
    }
    this.liveAt = -Infinity;
    this.holding = false;
    this.commit();
    this.lease.release();
  }

  /**
   * Sends operations produced outside the tracker (undo and redo).
   *
   * @param ops Operations.
   */
  operationsSend(ops: readonly EditOperation[]): void {
    if (ops.length > 0) this.editSend(ops, [], false);
    if (syncCollaborationHierarchy(ops)) this.hierarchyListener?.();
  }

  /**
   * Applies relayed edits in relay order, or buffers them before sync.
   *
   * @param list Relayed edits.
   */
  remoteEdits(list: readonly SyncCollaborationRemoteEdit[]): void {
    if (!this.synced) {
      this.buffered.push(...list);
      return;
    }
    let changed = 0;
    const self = this.replica.locks.selfGet();
    list.forEach((edit) => {
      if (edit.from === self && edit.ops.length === 0) {
        this.outbox.acknowledge(edit.seq);
        this.replica.pendingAck(edit.seq);
        return;
      }
      if (edit.ops.length === 0) return;
      if (!syncCollaborationLiveOnly(edit.ops)) this.commit();
      changed += this.replica.remoteApply(edit.ops).size;
      this.droppedReport(edit.from);
    });
    if (changed > 0) this.host.refresh();
  }

  /**
   * Tells the user that a remote delete dropped their unacknowledged change.
   *
   * @param from Member who deleted.
   */
  private droppedReport(from: number): void {
    const names = this.replica.droppedOwn;
    if (names.length === 0) return;
    this.replica.droppedOwn = [];
    const label = names[0] === '' || names[0] === undefined ? 'an object' : `"${names[0]}"`;
    this.host.status(`Your change to ${label} was dropped: ${this.memberName(from)} deleted it`);
  }

  /**
   * Drops another member's uncommitted live preview of nodes they no longer
   * hold.
   *
   * @param ids Ids whose remote lock ended.
   */
  previewRestore(ids: Iterable<string>): void {
    if (!this.synced) return;
    if (this.replica.previewRestore(ids).size > 0) this.host.refresh();
  }

  /**
   * Reverts a rejected edit and drops its undo step.
   *
   * @param seq Rejected sequence number.
   * @param reason Relay reason code.
   * @param why Detail of a `lock_unverified` rejection, or empty.
   */
  rejected(seq: number, reason: string, why: string = ''): void {
    const pending = this.outbox.reject(seq);
    this.replica.pendingAck(seq);
    if (reason === 'lease_stale' || reason === 'outside_lease') this.lease.expired();
    if (pending === undefined) return;
    this.rejections++;
    this.rejectionReason = reason === 'lock_unverified' && why !== '' ? `${reason}:${why}` : reason;
    editCollaborationRevert(this.replica, pending.changes);
    if (pending.entry !== null) this.history.drop(pending.entry);
    this.host.status(syncCollaborationRejection(reason, why));
    this.host.refresh();
  }

  /**
   * Answers a relay `verify` query as the room owner from the agreed hierarchy;
   * a malformed query is answered `invalid`.
   *
   * @param message Relay query.
   */
  verify(message: SocketCollaborationMessage): void {
    const ids = verifyCollaborationIds(message['ids']);
    const anc = verifyCollaborationIds(message['anc']);
    const parentOf = (id: string): string | undefined => this.replica.baselines.get(id)?.state.parent;
    const v = ids === null || anc === null ? 'invalid' : verifyCollaborationVerdict(parentOf, ids, anc);
    this.transport.send({ t: 'verify.result', q: Number(message['q']), v });
  }

  /** Forgets all room state; the scene itself is left as it is. */
  clear(): void {
    this.replica.clear();
    this.history.clear();
    this.outbox.clear();
    this.ticker.reset();
    this.lease.clear();
    this.gate.clear();
    this.liveAt = -Infinity;
    this.holding = false;
    this.liveSuppressed = false;
    this.buffered.length = 0;
    this.synced = false;
    this.held = false;
  }

  /**
   * Builds, sends and tracks one edit. Live previews carry the running lease;
   * other edits carry it when it covers their targets, go untagged when the
   * pending lease asked for them (the relay orders them after the request), and
   * otherwise end the running operation first so they are plain one-shot edits
   * (never outside a running lease).
   *
   * @param ops Operations.
   * @param changes Undo changes behind the operations.
   * @param record True to record an undo step.
   * @param live True for live previews of the running operation.
   */
  private editSend(
    ops: readonly EditOperation[],
    changes: TrackerCollaborationChange[],
    record: boolean,
    live: boolean = false,
  ): void {
    const entry: HistoryCollaborationEntry | null = record && changes.length > 0 ? { changes } : null;
    if (entry !== null) this.history.record(entry);
    const tag = this.leaseTag(ops, live);
    const messages: EditCollaborationMessage[] = this.outbox.build(ops, changes, entry);
    messages.forEach((message) => {
      this.replica.pendingAdd(message.seq, message.ops);
      const bulk = message.ops.reduce(
        (sum, op) => sum + (op.k === 'create' || op.k === 'delete' ? op.ids.length : 0),
        0,
      );
      this.gate.send(tag === null ? message : { ...message, lease: tag }, tag === null ? 1 : 0, bulk);
    });
    const deleted = syncCollaborationDeleted(ops);
    if (deleted.length > 0) {
      this.replica.locks.apply(this.replica.locks.selfGet(), [], deleted);
      this.replica.locks.requestRemove(deleted);
      this.lease.forget(deleted);
    }
    if (tag !== null) this.lease.adopt(ops.flatMap((op) => (op.k === 'create' ? op.ids : [])));
  }

  /**
   * Returns the lease number an edit carries.
   *
   * @param ops Operations.
   * @param live True for live previews.
   * @returns Lease number, or null for an untagged edit.
   */
  private leaseTag(ops: readonly EditOperation[], live: boolean): number | null {
    if (live) return this.lease.lease();
    const ids = ops.flatMap((op) => (op.k === 'create' ? [] : op.ids));
    if (this.lease.covers(ids)) return this.lease.lease();
    if (this.lease.asks(ids)) return null;
    this.holding = false;
    this.lease.release();
    return null;
  }

  /**
   * Tells the user about reverted or oversized changes.
   *
   * @param result Commit result.
   */
  private commitReport(result: TrackerCollaborationCommit): void {
    const refusal = result.refused[0];
    if (refusal !== undefined) {
      this.host.status(this.refusalNames(refusal));
      this.host.refresh();
    } else if (result.reverted.length > 0) {
      const locks = this.replica.locks;
      const held = result.reverted.find((id) => locks.heldByOther(id));
      const holder = held === undefined ? undefined : locks.holder(held);
      const who = holder === undefined ? 'another member' : this.memberName(holder);
      this.host.status(`Your change was reverted: ${who} is editing that object; try again when they are done`);
      this.host.refresh();
    }
    if (result.oversized.length > 0) this.host.status('An object is too large to synchronize; its change was reverted');
  }
}

/**
 * Returns whether operations create or move nodes.
 *
 * @param ops Operations.
 * @returns True when the hierarchy changed.
 */
export function syncCollaborationHierarchy(ops: readonly EditOperation[]): boolean {
  return ops.some((op) => op.k === 'create' || op.k === 'reparent' || op.k === 'delete');
}

/**
 * Returns the ids that operations delete; the relay releases their locks
 * without echoing that to the sender.
 *
 * @param ops Operations.
 * @returns Deleted node ids.
 */
export function syncCollaborationDeleted(ops: readonly EditOperation[]): string[] {
  return ops.flatMap((op) => (op.k === 'delete' ? op.ids : []));
}

/**
 * Returns the status shown when the relay rejected an edit.
 *
 * @param reason Relay reason code, optionally followed by `:` and the detail.
 * @param why Detail of a `lock_unverified` rejection, or empty.
 * @returns Status message.
 */
export function syncCollaborationRejection(reason: string, why: string = ''): string {
  const [code = '', detail = why] = reason.split(':');
  if (code === 'lock_conflict') {
    return 'Change rejected: another member is editing an object or container it touches; reverted';
  }
  if (code === 'lease_stale' || code === 'outside_lease') return 'Your edit timed out and was reverted; try again';
  if (code === 'rate_limited' || code === 'throttled') return 'Too many changes at once; slow down a little (reverted)';
  if (code === 'lock_unverified') return `Change rejected: ${verifyCollaborationReason(detail)}; reverted`;
  return `Change rejected by the room (${code.replace(/_/g, ' ')}); reverted`;
}

/**
 * Returns whether an edit only carries live transforms.
 *
 * @param ops Operations.
 * @returns True when every operation is live.
 */
export function syncCollaborationLiveOnly(ops: readonly EditOperation[]): boolean {
  return ops.every((op) => op.k === 'transform' && (op.d as { live?: unknown } | undefined)?.live === 1);
}
