import type { CommandStackObserver } from '@/commands/command_stack.js';
import type { HostCollaborationEditor } from '@/collaboration/host/host_collaboration_editor.js';
import type { SessionCollaborationTransport } from '@/collaboration/session/session_collaboration_types.js';
import type { SyncCollaborationSession } from '@/collaboration/session/session_collaboration_sync.js';
import {
  historyCollaborationApply,
  historyCollaborationCheck,
  type HistoryCollaborationCheck,
} from '@/collaboration/sync/history_collaboration_apply.js';
import type { HistoryCollaborationEntry } from '@/collaboration/sync/history_collaboration_stack.js';
import type { MemberCollaborationRoster } from '@/collaboration/sync/member_collaboration_roster.js';
import { selectionCollaborationChunks } from '@/collaboration/sync/selection_collaboration_locks.js';

/**
 * Per-user undo and redo inside a room. Replaces the editor's command history
 * while attached: each step only restores the user's own committed changes, and
 * steps touching objects other members hold or changed are refused.
 */
export class HistoryCollaborationObserver implements CommandStackObserver {
  private readonly host: HostCollaborationEditor;
  private readonly transport: SessionCollaborationTransport;
  private readonly sync: SyncCollaborationSession;
  private readonly roster: MemberCollaborationRoster;
  private busy: boolean;

  /**
   * Creates the observer.
   *
   * @param host Editor services.
   * @param transport Relay connection.
   * @param sync Edit loop.
   * @param roster Room members.
   */
  constructor(
    host: HostCollaborationEditor,
    transport: SessionCollaborationTransport,
    sync: SyncCollaborationSession,
    roster: MemberCollaborationRoster,
  ) {
    this.host = host;
    this.transport = transport;
    this.sync = sync;
    this.roster = roster;
    this.busy = false;
  }

  /** Commits right after every editor command so undo steps match commands. */
  commandExecuted(): void {
    this.sync.tracker.markDirty();
    this.sync.commit();
  }

  /**
   * Undoes the user's last own step.
   *
   * @returns True when applied immediately.
   */
  historyUndo(): boolean {
    return this.step(false);
  }

  /**
   * Redoes the user's last undone step.
   *
   * @returns True when applied immediately.
   */
  historyRedo(): boolean {
    return this.step(true);
  }

  /**
   * Returns the number of own undo steps.
   *
   * @returns Undo count.
   */
  historyUndoCount(): number {
    return this.sync.history.count(false);
  }

  /**
   * Returns the number of own redo steps.
   *
   * @returns Redo count.
   */
  historyRedoCount(): number {
    return this.sync.history.count(true);
  }

  /**
   * Applies one undo or redo step when allowed.
   *
   * @param redo True to redo.
   * @returns True when applied immediately.
   */
  private step(redo: boolean): boolean {
    if (this.busy || !this.sync.isSynced()) return false;
    this.sync.commit();
    const entry = this.sync.history.peek(redo);
    if (entry === undefined) return false;
    const check = historyCollaborationCheck(this.sync.replica, entry, redo);
    if (!check.ok) {
      this.refuse(check, entry, redo);
      return false;
    }
    if (check.missing.length === 0) {
      this.finish(entry, redo);
      return true;
    }
    void this.stepLocked(entry, redo, check.missing);
    return false;
  }

  /**
   * Locks the step's free nodes, applies the step, then releases them.
   *
   * @param entry History step.
   * @param redo True to redo.
   * @param missing Ids nobody holds.
   */
  private async stepLocked(entry: HistoryCollaborationEntry, redo: boolean, missing: string[]): Promise<void> {
    this.busy = true;
    try {
      const acquired = await this.acquire(missing);
      const check = historyCollaborationCheck(this.sync.replica, entry, redo);
      if (acquired && check.ok && this.sync.history.peek(redo) === entry) this.finish(entry, redo);
      else if (!check.ok) this.refuse(check, entry, redo);
      else this.host.status(`Cannot ${redo ? 'redo' : 'undo'}: another member started editing those objects`);
    } finally {
      this.busy = false;
      this.release(missing);
    }
  }

  /**
   * Acquires extra locks without touching the selection locks.
   *
   * @param ids Ids to lock.
   * @returns True when every chunk was granted.
   */
  private async acquire(ids: string[]): Promise<boolean> {
    const chunks = selectionCollaborationChunks(ids, this.transport.limits.idsPerMessage);
    const locks = this.sync.replica.locks;
    for (const chunk of chunks) {
      const reply = await this.transport.request({ t: 'lock.acquire', ids: chunk, replace: false }).catch(() => null);
      if (reply?.['ok'] !== true) return false;
      locks.apply(locks.selfGet(), chunk, []);
    }
    return true;
  }

  /**
   * Releases locks taken for a history step that are not selected.
   *
   * @param ids Ids to release.
   */
  private release(ids: string[]): void {
    const locks = this.sync.replica.locks;
    const requested = locks.requestedIds();
    const free = ids.filter((id) => !requested.has(id));
    if (free.length === 0) return;
    locks.apply(locks.selfGet(), [], free);
    selectionCollaborationChunks(free, this.transport.limits.idsPerMessage).forEach((chunk) =>
      this.transport.send({ t: 'lock.release', ids: chunk }),
    );
  }

  /**
   * Applies a checked step and sends it.
   *
   * @param entry History step.
   * @param redo True to redo.
   */
  private finish(entry: HistoryCollaborationEntry, redo: boolean): void {
    const replica = this.sync.replica;
    const created = entry.changes
      .filter((change) => (redo ? change.after : change.before) !== null && !replica.baselines.has(change.id))
      .map((change) => change.id);
    const applied = historyCollaborationApply(replica, entry, redo);
    this.sync.history.shift(redo);
    this.sync.operationsSend(applied.ops);
    replica.locks.requestAdd(created);
    this.host.refresh();
  }

  /**
   * Explains why a step was refused. Steps whose objects others changed since
   * can never apply again and are dropped; locked steps stay for a retry.
   *
   * @param check Failed check.
   * @param entry Refused step; dropped when others changed its objects since.
   * @param redo True for redo.
   */
  private refuse(check: HistoryCollaborationCheck, entry: HistoryCollaborationEntry, redo: boolean): void {
    const action = redo ? 'redo' : 'undo';
    if (check.ok) return;
    if (check.reason === 'locked') {
      this.host.status(`Cannot ${action}: ${this.roster.nameOf(check.holder)} is editing an affected object`);
      return;
    }
    this.sync.history.drop(entry);
    this.host.status(`Skipped ${action} step: another member has since changed an affected object`);
  }
}
