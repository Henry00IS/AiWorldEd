import type { HostCollaborationEditor } from '@/collaboration/host/host_collaboration_editor.js';
import type { SyncCollaborationSession } from '@/collaboration/session/session_collaboration_sync.js';
import type { EditOperation } from '@/collaboration/shared/protocol_definitions.js';
import type { NodeCollaborationState } from '@/collaboration/scene/node_collaboration_types.js';
import {
  snapshotCollaborationText,
  type SnapshotCollaborationHistory,
  type SnapshotCollaborationReason,
} from '@/collaboration/snapshot/store_collaboration_snapshot.js';
import { projectHistorySaveKind, type ProjectHistoryEntry } from '@/project/history/core/project_history_entry.js';
import type { ProjectHistoryRecord } from '@/project/history/core/project_history_store.js';
import { projectTextureCacheKeep } from '@/project/textures/cache/project_texture_cache.js';

/** Time between periodic saves of a changed scene. */
export const SNAPSHOT_COLLABORATION_PERIOD_MS = 5 * 60_000;
/** Deleted objects in one relayed batch that trigger a save first. */
export const SNAPSHOT_COLLABORATION_LARGE_DELETES = 20;
/** Share of the scene deleted in one relayed batch that triggers a save first. */
export const SNAPSHOT_COLLABORATION_LARGE_SHARE = 0.25;
/** Minimum time between saves taken before large changes. */
export const SNAPSHOT_COLLABORATION_LARGE_INTERVAL_MS = 30_000;

/**
 * A client's history of the room: every member saves the agreed scene into its
 * own Level History as a snapshot once fully joined and on every manual save.
 * The owner also saves it every few minutes while it changes and before large
 * relayed deletions (a snapshot once 30 minutes passed since the last one, else
 * an autosave).
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
  private lastSnapshot: number;

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
    this.lastSnapshot = clock();
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
   * Returns the store the room's saves go to.
   *
   * @returns Store.
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
   * Saves the agreed scene now: a snapshot once the room is fully joined, on a
   * manual save or when 30 minutes passed since the last snapshot, else an
   * autosave.
   *
   * @param reason Why the scene is saved.
   * @returns The save, or null before the room synced.
   */
  async take(reason: SnapshotCollaborationReason): Promise<ProjectHistoryEntry | null> {
    const kind =
      reason === 'joined' || reason === 'saved' ? 'snapshot' : projectHistorySaveKind(this.clock(), this.lastSnapshot);
    const prepared = await this.recordPrepare(kind);
    if (prepared === null) return null;
    if (kind === 'snapshot') this.lastSnapshot = prepared.record.time;
    return prepared.history.store.add(prepared.record).catch(() => null);
  }

  /**
   * Captures the agreed scene, its thumbnail and its embedded textures.
   *
   * @param kind Kind of the save.
   * @returns History and record, or null before the room synced.
   */
  private async recordPrepare(kind: ProjectHistoryRecord['kind']): Promise<{
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
    const record: ProjectHistoryRecord = {
      kind,
      source: 'room',
      time,
      path: null,
      title: null,
      room: this.room,
      objectCount: states.length,
      state,
      shot,
    };
    return { history, record };
  }
}
