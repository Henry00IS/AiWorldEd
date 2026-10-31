import type { HostCollaborationEditor } from '@/collaboration/host/host_collaboration_editor.js';
import type { NodeCollaborationState } from '@/collaboration/scene/node_collaboration_types.js';
import type { SessionCollaborationTransport } from '@/collaboration/session/session_collaboration_types.js';
import {
  EditCollaborationOutbox,
  editCollaborationRevert,
  type EditCollaborationMessage,
} from '@/collaboration/sync/edit_collaboration_outbox.js';
import {
  HistoryCollaborationStack,
  type HistoryCollaborationEntry,
} from '@/collaboration/sync/history_collaboration_stack.js';
import { LiveCollaborationTicker } from '@/collaboration/sync/live_collaboration_ticker.js';
import { ReplicaCollaborationScene } from '@/collaboration/sync/replica_collaboration_scene.js';
import {
  TrackerCollaboration,
  type TrackerCollaborationChange,
  type TrackerCollaborationCommit,
} from '@/collaboration/sync/tracker_collaboration_commit.js';
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
  private readonly buffered: SyncCollaborationRemoteEdit[];
  private synced: boolean;
  private acknowledging: boolean;

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
    this.history = new HistoryCollaborationStack();
    this.ticker = new LiveCollaborationTicker(this.replica, this.tracker);
    this.outbox = new EditCollaborationOutbox(limits.opsPerEdit);
    this.buffered = [];
    this.synced = false;
    this.acknowledging = false;
  }

  /**
   * Returns whether the scene is synchronized with the room.
   *
   * @returns True once editing is allowed.
   */
  isSynced(): boolean {
    return this.synced;
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
    if (!this.synced) return null;
    const result = this.tracker.commit();
    this.ticker.reset();
    if (result.created.length > 0) this.replica.locks.requestAdd(result.created);
    if (result.ops.length > 0) this.editSend(result.ops, result.changes, true);
    this.commitReport(result);
    return result;
  }

  /** Broadcasts live transforms of held nodes. */
  liveTick(): void {
    if (!this.synced) return;
    const ops = this.ticker.collect(this.transport.limits.opsPerEdit);
    if (ops.length > 0) this.editSend(ops, [], false);
  }

  /**
   * Sends operations produced outside the tracker (undo and redo).
   *
   * @param ops Operations.
   */
  operationsSend(ops: readonly EditOperation[]): void {
    if (ops.length > 0) this.editSend(ops, [], false);
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
    list.forEach((edit) => {
      if (!syncCollaborationLiveOnly(edit.ops)) this.commit();
      changed += this.replica.remoteApply(edit.ops).size;
    });
    if (changed > 0) this.host.refresh();
  }

  /**
   * Reverts a rejected edit and drops its undo step.
   *
   * @param seq Rejected sequence number.
   * @param reason Relay reason code.
   */
  rejected(seq: number, reason: string): void {
    const pending = this.outbox.reject(seq);
    if (pending === undefined) return;
    editCollaborationRevert(this.replica, pending.changes);
    if (pending.entry !== null) this.history.drop(pending.entry);
    this.host.status(`Change rejected by the room (${reason.replace(/_/g, ' ')}); reverted`);
    this.host.refresh();
  }

  /** Forgets all room state; the scene itself is left as it is. */
  clear(): void {
    this.replica.clear();
    this.history.clear();
    this.outbox.clear();
    this.ticker.reset();
    this.buffered.length = 0;
    this.synced = false;
  }

  /**
   * Builds, sends and tracks one edit.
   *
   * @param ops Operations.
   * @param changes Undo changes behind the operations.
   * @param record True to record an undo step.
   */
  private editSend(ops: readonly EditOperation[], changes: TrackerCollaborationChange[], record: boolean): void {
    const entry: HistoryCollaborationEntry | null = record && changes.length > 0 ? { changes } : null;
    if (entry !== null) this.history.record(entry);
    const messages: EditCollaborationMessage[] = this.outbox.build(ops, changes, entry);
    messages.forEach((message) => this.transport.send(message));
    if (changes.length > 0) this.acknowledgeSchedule();
  }

  /** Requests a ping whose reply acknowledges every edit sent before it. */
  private acknowledgeSchedule(): void {
    if (this.acknowledging) return;
    this.acknowledging = true;
    const sequence = this.outbox.lastSequence();
    this.transport
      .request({ t: 'ping' })
      .then(() => this.outbox.acknowledge(sequence))
      .catch(() => undefined)
      .finally(() => this.acknowledgeDone(sequence));
  }

  /**
   * Re-arms acknowledgement when edits were sent while a ping was in flight.
   *
   * @param sequence Sequence the finished ping covered.
   */
  private acknowledgeDone(sequence: number): void {
    this.acknowledging = false;
    if (this.synced && this.outbox.lastSequence() > sequence && this.outbox.pendingCount() > 0)
      this.acknowledgeSchedule();
  }

  /**
   * Tells the user about reverted or oversized changes.
   *
   * @param result Commit result.
   */
  private commitReport(result: TrackerCollaborationCommit): void {
    if (result.reverted.length > 0) {
      this.host.status('Select an object before changing it; changes to objects you have not selected were reverted');
      this.host.refresh();
    }
    if (result.oversized.length > 0) this.host.status('An object is too large to synchronize; its change was reverted');
  }
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
