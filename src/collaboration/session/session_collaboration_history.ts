import type { McpToolResult } from '@/ai/shared/mcp_protocol_types.js';
import type { CommandStackObserver } from '@/commands/command_stack.js';
import type { HostCollaborationEditor } from '@/collaboration/host/host_collaboration_editor.js';
import type { SyncCollaborationSession } from '@/collaboration/session/session_collaboration_sync.js';
import {
  historyCollaborationApply,
  historyCollaborationCheck,
  type HistoryCollaborationCheck,
  type HistoryCollaborationSkip,
} from '@/collaboration/sync/history_collaboration_apply.js';
import type { HistoryCollaborationEntry } from '@/collaboration/sync/history_collaboration_stack.js';
import type { MemberCollaborationRoster } from '@/collaboration/sync/member_collaboration_roster.js';

/**
 * Per-user undo and redo inside a room. Replaces the editor's command history
 * while attached. Each step is a lock-free one-shot edit: a field-level inverse
 * of the user's own change written onto the current scene (last-writer-wins in
 * relay order), so other members' concurrent changes to other fields survive.
 * Changes of objects another member deleted are skipped with a notice and never
 * resurrected; a step is only refused while another member's active edit lease
 * covers an affected object.
 */
export class HistoryCollaborationObserver implements CommandStackObserver {
  private readonly host: HostCollaborationEditor;
  private readonly sync: SyncCollaborationSession;
  private readonly roster: MemberCollaborationRoster;
  private commitQueued: boolean;
  /** Structured result of the last refused undo or redo, cleared by tools. */
  refusal: McpToolResult | null;

  /**
   * Creates the observer.
   *
   * @param host Editor services.
   * @param sync Edit loop.
   * @param roster Room members.
   */
  constructor(host: HostCollaborationEditor, sync: SyncCollaborationSession, roster: MemberCollaborationRoster) {
    this.host = host;
    this.sync = sync;
    this.roster = roster;
    this.commitQueued = false;
    this.refusal = null;
  }

  /**
   * Resolves once a running step finished; steps apply synchronously, so this
   * resolves immediately (kept for the tools that await it).
   *
   * @returns Resolved promise.
   */
  idle(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Commits once the code that ran an editor command finished, so follow-up
   * changes made in the same call (texture lock rebakes, visual refreshes) join
   * the command's undo step instead of becoming a step of their own.
   */
  commandExecuted(): void {
    this.sync.tracker.markDirty();
    if (this.commitQueued) return;
    this.commitQueued = true;
    queueMicrotask(() => {
      this.commitQueued = false;
      this.sync.commit();
    });
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
   * @returns True when applied.
   */
  private step(redo: boolean): boolean {
    if (!this.sync.isSynced()) return false;
    this.sync.commit();
    const entry = this.sync.history.peek(redo);
    if (entry === undefined) return false;
    const check = historyCollaborationCheck(this.sync.replica, entry, redo);
    if (!check.ok) {
      this.refuse(check, redo);
      return false;
    }
    this.refusal = null;
    this.finish(entry, redo);
    return true;
  }

  /**
   * Applies a checked step and sends it as one-shot edits.
   *
   * @param entry History step.
   * @param redo True to redo.
   */
  private finish(entry: HistoryCollaborationEntry, redo: boolean): void {
    const applied = historyCollaborationApply(this.sync.replica, entry, redo);
    this.sync.history.shift(redo);
    this.sync.operationsSend(applied.ops);
    if (applied.skipped.length > 0) this.skippedShow(applied.skipped, redo);
    this.host.refresh();
  }

  /**
   * Tells the user which parts of a step were skipped.
   *
   * @param skipped Skipped changes.
   * @param redo True for redo.
   */
  private skippedShow(skipped: readonly HistoryCollaborationSkip[], redo: boolean): void {
    const first = skipped[0];
    if (first === undefined) return;
    const action = redo ? 'Redo' : 'Undo';
    const name = this.nodeLabel(first.id);
    const more = skipped.length > 1 ? ` (and ${skipped.length - 1} more)` : '';
    const why =
      first.reason === 'foreign_children'
        ? `kept ${name}${more}: another member added objects inside it`
        : first.reason === 'parent_deleted'
          ? `skipped ${name}${more}: the group it was in was deleted by another member`
          : `skipped ${name}${more}: another member deleted it`;
    this.host.status(`${action} ${why}`);
  }

  /**
   * Returns a quoted object name for messages.
   *
   * @param id Node id.
   * @returns Label.
   */
  private nodeLabel(id: string): string {
    const name = this.sync.replica.applier.nodes().get(id)?.object.name ?? '';
    return name === '' ? 'an object' : `"${name}"`;
  }

  /**
   * Explains why a step was refused. The step stays for a retry once the other
   * member finished their operation.
   *
   * @param check Failed check.
   * @param redo True for redo.
   */
  private refuse(check: HistoryCollaborationCheck, redo: boolean): void {
    if (check.ok) return;
    const action = redo ? 'redo' : 'undo';
    this.refusalShow(
      `Can't ${action} yet: ${this.roster.nameOf(check.holder)} is editing ${this.nodeLabel(check.id)}; try again when they are done`,
      check.holder,
      check.id,
    );
  }

  /**
   * Shows a refused step and keeps it for a tool that asked for the step.
   *
   * @param message Status message.
   * @param holder Member holding an affected object, or -1.
   * @param id Affected node id, or empty.
   */
  private refusalShow(message: string, holder: number, id = ''): void {
    this.host.status(message);
    const refusal: McpToolResult = { ok: false, error: holder < 0 ? 'rejected' : 'locked', message };
    if (holder >= 0) refusal.holder = this.roster.nameOf(holder);
    const name = this.sync.replica.applier.nodes().get(id)?.object.name ?? '';
    if (name !== '') refusal.object = name;
    this.refusal = refusal;
  }
}
