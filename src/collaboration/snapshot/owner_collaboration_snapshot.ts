import type { HostCollaborationEditor } from '@/collaboration/host/host_collaboration_editor.js';
import type { SyncCollaborationSession } from '@/collaboration/session/session_collaboration_sync.js';
import type { EditOperation } from '@/collaboration/shared/protocol_definitions.js';
import type { NodeCollaborationState } from '@/collaboration/scene/node_collaboration_types.js';
import { historyCollaborationApply } from '@/collaboration/sync/history_collaboration_apply.js';
import { locksCollaborationConflicts } from '@/collaboration/session/session_collaboration_locks.js';
import {
  planCollaborationRestore,
  type PlanCollaborationSkip,
} from '@/collaboration/snapshot/plan_collaboration_restore.js';
import {
  snapshotCollaborationParse,
  snapshotCollaborationText,
  type SnapshotCollaborationHistory,
  type SnapshotCollaborationReason,
} from '@/collaboration/snapshot/store_collaboration_snapshot.js';
import {
  projectHistoryAutosaveRecord,
  projectHistorySnapshotRecord,
  type ProjectHistoryRecord,
} from '@/project/history/store/project_history_recorder.js';
import {
  projectHistoryTreeRestore,
  projectHistoryTreeSessionEnd,
} from '@/project/history/tree/project_history_tree_edit.js';
import type { ProjectHistoryNode } from '@/project/history/tree/project_history_tree.js';
import { projectTextureCacheKeep, projectTextureCacheRestore } from '@/project/textures/cache/project_texture_cache.js';

/** Time between periodic saves of a changed scene. */
export const SNAPSHOT_COLLABORATION_PERIOD_MS = 5 * 60_000;
/** Deleted objects in one relayed batch that trigger a save first. */
export const SNAPSHOT_COLLABORATION_LARGE_DELETES = 20;
/** Share of the scene deleted in one relayed batch that triggers a save first. */
export const SNAPSHOT_COLLABORATION_LARGE_SHARE = 0.25;
/** Lease requests a restore makes before it gives up on the refused objects. */
export const SNAPSHOT_COLLABORATION_LEASE_ATTEMPTS = 2;
/** Minimum time between saves taken before large changes. */
export const SNAPSHOT_COLLABORATION_LARGE_INTERVAL_MS = 30_000;

/** Outcome of a restore. */
export interface SnapshotCollaborationRestoreReport {
  ok: boolean;
  message: string;
  restored: number;
  skipped: PlanCollaborationSkip[];
}

/**
 * The room owner's history of the room: the agreed scene is saved into the
 * room's Level History tree at room start, periodically while it changes and
 * before large relayed deletions; named snapshots are taken by hand, and a
 * restore applies under one edit lease as one undo step.
 */
export class SnapshotCollaborationOwner {
  private readonly sync: SyncCollaborationSession;
  private readonly host: HostCollaborationEditor;
  private readonly history: () => Promise<SnapshotCollaborationHistory>;
  private readonly room: string;
  private readonly clock: () => number;
  private revisionSaved: number;
  private periodicAt: number;
  private largeAt: number;
  private restoring: boolean;

  /**
   * Creates the room history keeper.
   *
   * @param sync Edit loop.
   * @param host Editor services.
   * @param history Returns where the room's history goes, read again for every
   *   save.
   * @param room Room name, written into each saved state.
   * @param clock Time source in milliseconds.
   */
  constructor(
    sync: SyncCollaborationSession,
    host: HostCollaborationEditor,
    history: () => Promise<SnapshotCollaborationHistory>,
    room = '',
    clock: () => number = Date.now,
  ) {
    this.sync = sync;
    this.host = host;
    this.history = history;
    this.room = room;
    this.clock = clock;
    this.revisionSaved = -1;
    this.periodicAt = clock();
    this.largeAt = -Infinity;
    this.restoring = false;
  }

  /**
   * Tells whether the agreed scene changed since it was last saved.
   *
   * @returns True with unsaved changes.
   */
  pending(): boolean {
    return this.sync.replica.revision !== this.revisionSaved;
  }

  /**
   * Returns the room's tree.
   *
   * @returns Tree store.
   */
  async store(): Promise<SnapshotCollaborationHistory['store']> {
    return (await this.history()).store;
  }

  /** Saves the scene when the period passed and the scene changed. */
  poll(): void {
    const now = this.clock();
    if (now - this.periodicAt < SNAPSHOT_COLLABORATION_PERIOD_MS) return;
    this.periodicAt = now;
    if (this.pending()) void this.take('periodic');
  }

  /**
   * Saves the scene before relayed operations that delete a large part of it.
   *
   * @param ops Relayed operations about to apply.
   */
  beforeRemote(ops: readonly EditOperation[]): void {
    const deleted = ops.reduce((total, op) => total + (op.k === 'delete' ? op.ids.length : 0), 0);
    if (deleted === 0) return;
    const count = this.sync.replica.baselines.size;
    const large =
      deleted >= SNAPSHOT_COLLABORATION_LARGE_DELETES || deleted >= count * SNAPSHOT_COLLABORATION_LARGE_SHARE;
    const now = this.clock();
    if (!large || count === 0 || now - this.largeAt < SNAPSHOT_COLLABORATION_LARGE_INTERVAL_MS) return;
    this.largeAt = now;
    void this.take('large-change');
  }

  /**
   * Saves the agreed scene into the room's editing session now.
   *
   * @param reason Why the scene is saved.
   * @returns The session node, or null before the room synced.
   */
  async take(reason: SnapshotCollaborationReason): Promise<ProjectHistoryNode | null> {
    const prepared = await this.recordPrepare();
    if (prepared === null) return null;
    const { history, record } = prepared;
    if (reason === 'room-start') await history.store.change((index) => projectHistoryTreeSessionEnd(index));
    return projectHistoryAutosaveRecord(history.store, record, reason === 'large-change').catch(() => null);
  }

  /**
   * Keeps the agreed scene as a named snapshot.
   *
   * @param name Snapshot name.
   * @returns The snapshot, or null before the room synced.
   */
  async snapshot(name: string): Promise<ProjectHistoryNode | null> {
    const prepared = await this.recordPrepare();
    if (prepared === null) return null;
    return projectHistorySnapshotRecord(prepared.history.store, prepared.record, name);
  }

  /**
   * Captures the agreed scene, its thumbnail and its embedded textures.
   *
   * @returns History and record, or null before the room synced.
   */
  private async recordPrepare(): Promise<{
    history: SnapshotCollaborationHistory;
    record: ProjectHistoryRecord;
  } | null> {
    if (!this.sync.isSynced()) return null;
    const states = JSON.parse(JSON.stringify(this.sync.replica.snapshotStates())) as NodeCollaborationState[];
    this.revisionSaved = this.sync.replica.revision;
    const time = this.clock();
    const history = await this.history();
    if (history.fileSystem !== null)
      await projectTextureCacheKeep(history.fileSystem, history.library, states).catch(() => undefined);
    const shot = (await this.host.historyThumbnail?.().catch(() => null)) ?? null;
    const state = snapshotCollaborationText(this.room, time, states);
    return { history, record: { state, objectCount: states.length, time, shot } };
  }

  /**
   * Reads the node states of a saved room state, with its embedded textures.
   *
   * @param id Node id.
   * @returns States, or null when missing or unreadable.
   */
  async states(id: string): Promise<NodeCollaborationState[] | null> {
    const history = await this.history();
    const file = await history.store.stateRead(id);
    const states = file === null ? null : snapshotCollaborationParse(await file.text());
    if (states !== null && history.fileSystem !== null && history.library !== null)
      await projectTextureCacheRestore(history.fileSystem, history.library, states).catch(() => 0);
    return states;
  }

  /**
   * Sets the room back to a saved state for everyone, as one undo step of the
   * owner. Unsaved changes are saved into the current session first, and the
   * marker moves to the restored state. Objects other members hold, and objects
   * that depend on them, stay as they are and are reported.
   *
   * @param id Node id.
   * @returns Report.
   */
  async restore(id: string): Promise<SnapshotCollaborationRestoreReport> {
    if (this.restoring || !this.sync.isSynced()) return this.report(false, 'Restore is not possible right now', 0, []);
    this.restoring = true;
    try {
      const states = await this.states(id);
      if (states === null) return this.report(false, 'Saved state not found or unreadable', 0, []);
      this.sync.commit();
      if (this.pending()) await this.take('periodic');
      const report = await this.restoreLocked(states);
      this.revisionSaved = this.sync.replica.revision;
      await (await this.store()).change((index) => projectHistoryTreeRestore(index, id));
      return report;
    } finally {
      this.restoring = false;
    }
  }

  /**
   * Takes the edit lease on the existing objects a restore changes (other
   * members' running edits are skipped), applies the restore as one one-shot
   * edit, then ends the lease again.
   *
   * @param states Saved node states.
   * @returns Report.
   */
  private async restoreLocked(states: NodeCollaborationState[]): Promise<SnapshotCollaborationRestoreReport> {
    const replica = this.sync.replica;
    const busy = new Set<string>();
    const held = await this.leaseTake(states, busy);
    try {
      const plan = planCollaborationRestore(replica, states, busy);
      if (plan.changes.length > 0) {
        const applied = historyCollaborationApply(replica, { changes: plan.changes }, true);
        this.sync.operationsRecord(applied.ops, plan.changes);
        this.host.refresh();
      }
      const message = this.summary(plan.changes.length, plan.skipped.length);
      return this.report(true, message, plan.changes.length, plan.skipped);
    } finally {
      if (held) this.sync.operationRelease();
    }
  }

  /**
   * Asks for the edit lease on the existing objects a restore changes. A
   * refusal marks the conflicting objects busy and asks once more without
   * them.
   *
   * @param states Saved node states.
   * @param busy Collects ids that could not be leased.
   * @returns True when a lease is held and must be released.
   */
  private async leaseTake(states: NodeCollaborationState[], busy: Set<string>): Promise<boolean> {
    for (let attempt = 0; attempt < SNAPSHOT_COLLABORATION_LEASE_ATTEMPTS; attempt += 1) {
      const ids = this.leaseIds(states, busy);
      if (ids.length === 0) return false;
      const outcome = await this.sync.operationHold(ids).catch(() => null);
      if (outcome?.ok === true) return true;
      const conflicts = locksCollaborationConflicts(outcome?.conflicts);
      const refused = conflicts.length === 0 ? ids : conflicts.map((conflict) => conflict.id);
      refused.forEach((id) => busy.add(id));
    }
    return false;
  }

  /**
   * Lists the existing objects a restore would change, minus busy ones.
   *
   * @param states Saved node states.
   * @param busy Ids that could not be leased.
   * @returns Ids to lease.
   */
  private leaseIds(states: NodeCollaborationState[], busy: ReadonlySet<string>): string[] {
    const plan = planCollaborationRestore(this.sync.replica, states, busy);
    return plan.changes.filter((change) => change.before !== null).map((change) => change.id);
  }

  /**
   * Words a restore outcome.
   *
   * @param restored Changed objects.
   * @param skipped Skipped objects.
   * @returns Message.
   */
  private summary(restored: number, skipped: number): string {
    const head = restored === 0 ? 'Scene already matches the saved state' : `Restored ${restored} object(s)`;
    return skipped === 0 ? head : `${head}; ${skipped} object(s) kept because other members are editing them`;
  }

  /**
   * Builds a report and shows its message.
   *
   * @param ok Whether the restore ran.
   * @param message Message.
   * @param restored Changed objects.
   * @param skipped Skipped objects.
   * @returns Report.
   */
  private report(
    ok: boolean,
    message: string,
    restored: number,
    skipped: PlanCollaborationSkip[],
  ): SnapshotCollaborationRestoreReport {
    this.host.status(message);
    return { ok, message, restored, skipped };
  }
}
