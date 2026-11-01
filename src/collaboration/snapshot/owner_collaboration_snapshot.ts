import type { HostCollaborationEditor } from '@/collaboration/host/host_collaboration_editor.js';
import type { SessionCollaborationTransport } from '@/collaboration/session/session_collaboration_types.js';
import type { SyncCollaborationSession } from '@/collaboration/session/session_collaboration_sync.js';
import type { EditOperation } from '@/collaboration/shared/protocol_definitions.js';
import { historyCollaborationApply } from '@/collaboration/sync/history_collaboration_apply.js';
import { selectionCollaborationChunks } from '@/collaboration/sync/selection_collaboration_locks.js';
import {
  planCollaborationRestore,
  type PlanCollaborationSkip,
} from '@/collaboration/snapshot/plan_collaboration_restore.js';
import {
  snapshotCollaborationId,
  type SnapshotCollaborationMeta,
  type SnapshotCollaborationReason,
  type SnapshotCollaborationScene,
  type SnapshotCollaborationStore,
} from '@/collaboration/snapshot/store_collaboration_snapshot.js';

/** Time between periodic snapshots of a changed scene. */
export const SNAPSHOT_COLLABORATION_PERIOD_MS = 5 * 60_000;
/** Deleted objects in one relayed batch that trigger a snapshot first. */
export const SNAPSHOT_COLLABORATION_LARGE_DELETES = 20;
/**
 * Share of the scene deleted in one relayed batch that triggers a snapshot
 * first.
 */
export const SNAPSHOT_COLLABORATION_LARGE_SHARE = 0.25;
/** Minimum time between snapshots taken before large changes. */
export const SNAPSHOT_COLLABORATION_LARGE_INTERVAL_MS = 30_000;

/** Outcome of a restore. */
export interface SnapshotCollaborationRestoreReport {
  ok: boolean;
  message: string;
  restored: number;
  skipped: PlanCollaborationSkip[];
}

/**
 * The room owner's scene snapshots: taken periodically while the scene changes
 * and before large relayed deletions, kept in memory and in the project folder,
 * and restored through the normal locked edit path as one undo step.
 */
export class SnapshotCollaborationOwner {
  private readonly sync: SyncCollaborationSession;
  private readonly transport: SessionCollaborationTransport;
  private readonly host: HostCollaborationEditor;
  private readonly stores: () => SnapshotCollaborationStore[];
  private readonly clock: () => number;
  private revisionSaved: number;
  private periodicAt: number;
  private largeAt: number;
  private restoring: boolean;

  /**
   * Creates the snapshot keeper.
   *
   * @param sync Edit loop.
   * @param transport Relay connection.
   * @param host Editor services.
   * @param stores Returns where snapshots go, read again for every save.
   * @param clock Time source in milliseconds.
   */
  constructor(
    sync: SyncCollaborationSession,
    transport: SessionCollaborationTransport,
    host: HostCollaborationEditor,
    stores: () => SnapshotCollaborationStore[],
    clock: () => number = Date.now,
  ) {
    this.sync = sync;
    this.transport = transport;
    this.host = host;
    this.stores = stores;
    this.clock = clock;
    this.revisionSaved = -1;
    this.periodicAt = clock();
    this.largeAt = -Infinity;
    this.restoring = false;
  }

  /** Takes a periodic snapshot when the period passed and the scene changed. */
  poll(): void {
    const now = this.clock();
    if (now - this.periodicAt < SNAPSHOT_COLLABORATION_PERIOD_MS) return;
    this.periodicAt = now;
    if (this.sync.replica.revision !== this.revisionSaved) void this.take('periodic');
  }

  /**
   * Takes a snapshot before relayed operations that delete a large part of the
   * scene.
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
   * Captures the agreed scene now and saves it to every store.
   *
   * @param reason Why the snapshot is taken.
   * @returns Snapshot entry, or null before the room synced.
   */
  async take(reason: SnapshotCollaborationReason): Promise<SnapshotCollaborationMeta | null> {
    if (!this.sync.isSynced()) return null;
    const states = structuredClone(this.sync.replica.snapshotStates());
    this.revisionSaved = this.sync.replica.revision;
    const savedAt = this.clock();
    const id = snapshotCollaborationId(savedAt, states.length, reason);
    const scene: SnapshotCollaborationScene = { id, savedAt, count: states.length, reason, stored: 'memory', states };
    await Promise.all(this.stores().map((store) => store.save(scene).catch(() => undefined)));
    return { id, savedAt, count: states.length, reason, stored: 'memory' };
  }

  /**
   * Lists snapshots of every store, newest first; one id appears once.
   *
   * @returns Snapshot list.
   */
  async list(): Promise<SnapshotCollaborationMeta[]> {
    const lists = await Promise.all(this.stores().map((store) => store.list().catch(() => [])));
    const unique = new Map<string, SnapshotCollaborationMeta>();
    lists.flat().forEach((meta) => {
      if (!unique.has(meta.id) || meta.stored === 'project') unique.set(meta.id, meta);
    });
    return [...unique.values()].sort((left, right) => right.savedAt - left.savedAt);
  }

  /**
   * Restores a snapshot as one undo step of the owner. Objects other members
   * hold, and objects that depend on them, stay as they are and are reported.
   *
   * @param id Snapshot id.
   * @returns Report.
   */
  async restore(id: string): Promise<SnapshotCollaborationRestoreReport> {
    if (this.restoring || !this.sync.isSynced()) return this.report(false, 'Restore is not possible right now', 0, []);
    this.restoring = true;
    try {
      const scene = await this.load(id);
      if (scene === null) return this.report(false, 'Snapshot not found or unreadable', 0, []);
      this.sync.commit();
      await this.take('before-restore');
      return await this.restoreLocked(scene);
    } finally {
      this.restoring = false;
    }
  }

  /**
   * Loads a snapshot from the first store that has it.
   *
   * @param id Snapshot id.
   * @returns Snapshot, or null.
   */
  private async load(id: string): Promise<SnapshotCollaborationScene | null> {
    for (const store of this.stores()) {
      const scene = await store.load(id).catch(() => null);
      if (scene !== null) return scene;
    }
    return null;
  }

  /**
   * Locks the free objects a restore touches, applies the restore, then
   * releases them again.
   *
   * @param scene Snapshot.
   * @returns Report.
   */
  private async restoreLocked(scene: SnapshotCollaborationScene): Promise<SnapshotCollaborationRestoreReport> {
    const replica = this.sync.replica;
    const first = planCollaborationRestore(replica, scene.states);
    const missing = first.changes.map((change) => change.id).filter((id) => replica.locks.holder(id) === undefined);
    const busy = await this.acquire(missing);
    try {
      const plan = planCollaborationRestore(replica, scene.states, busy);
      if (plan.changes.length > 0) {
        const applied = historyCollaborationApply(replica, { changes: plan.changes }, true);
        this.sync.operationsRecord(applied.ops, plan.changes);
        this.host.refresh();
      }
      return this.report(
        true,
        this.summary(plan.changes.length, plan.skipped.length),
        plan.changes.length,
        plan.skipped,
      );
    } finally {
      this.release(missing.filter((id) => !busy.has(id)));
    }
  }

  /**
   * Acquires locks chunk by chunk.
   *
   * @param ids Ids nobody holds.
   * @returns Ids of chunks that were refused.
   */
  private async acquire(ids: string[]): Promise<Set<string>> {
    const busy = new Set<string>();
    const locks = this.sync.replica.locks;
    for (const chunk of selectionCollaborationChunks(ids, this.transport.limits.idsPerMessage)) {
      const reply = await this.transport.request({ t: 'lock.acquire', ids: chunk, replace: false }).catch(() => null);
      if (reply?.['ok'] === true) locks.apply(locks.selfGet(), chunk, []);
      else chunk.forEach((id) => busy.add(id));
    }
    return busy;
  }

  /**
   * Releases locks taken for the restore that are not selected.
   *
   * @param ids Ids to release.
   */
  private release(ids: string[]): void {
    const locks = this.sync.replica.locks;
    const requested = locks.requestedIds();
    const free = ids.filter((id) => !requested.has(id) && locks.heldBySelf(id));
    if (free.length === 0) return;
    locks.apply(locks.selfGet(), [], free);
    selectionCollaborationChunks(free, this.transport.limits.idsPerMessage).forEach((chunk) =>
      this.transport.send({ t: 'lock.release', ids: chunk }),
    );
  }

  /**
   * Words a restore outcome.
   *
   * @param restored Changed objects.
   * @param skipped Skipped objects.
   * @returns Message.
   */
  private summary(restored: number, skipped: number): string {
    const head = restored === 0 ? 'Scene already matches the snapshot' : `Restored ${restored} object(s)`;
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
