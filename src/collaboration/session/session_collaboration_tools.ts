import type { McpEditorToolGuard } from '@/ai/client/handler_mcp_bridge.js';
import type { McpToolResult } from '@/ai/shared/mcp_protocol_types.js';
import type { HostCollaborationEditor } from '@/collaboration/host/host_collaboration_editor.js';
import type { HistoryCollaborationObserver } from '@/collaboration/session/session_collaboration_history.js';
import type {
  LocksCollaborationRefusal,
  LocksCollaborationSession,
} from '@/collaboration/session/session_collaboration_locks.js';
import type { SyncCollaborationSession } from '@/collaboration/session/session_collaboration_sync.js';
import { syncCollaborationRejection } from '@/collaboration/session/session_collaboration_sync.js';
import type { SessionCollaborationTransport } from '@/collaboration/session/session_collaboration_types.js';
import type { MemberCollaborationRoster } from '@/collaboration/sync/member_collaboration_roster.js';
import {
  trackerCollaborationDiscard,
  trackerCollaborationTouched,
  type TrackerCollaborationTouch,
} from '@/collaboration/sync/tracker_collaboration_touched.js';

/** Services a tool guard works with. */
export interface ToolsCollaborationParts {
  host: HostCollaborationEditor;
  transport: SessionCollaborationTransport;
  sync: SyncCollaborationSession;
  locks: LocksCollaborationSession;
  history: HistoryCollaborationObserver;
  roster: MemberCollaborationRoster;
}

/** Longest wait for the local user's running operation before a tool is refused as busy. */
export const TOOLS_COLLABORATION_BUSY_WAIT_MS = 5000;

/** Poll interval of that wait. */
export const TOOLS_COLLABORATION_BUSY_POLL_MS = 100;

/**
 * Runs AI (MCP) tools inside a room as the local user, on the same path as a
 * one-shot edit: the tool's changes are held back, refused when another
 * member's running operation covers them (structured `locked` error naming the
 * object and the holder), otherwise sent as id-addressed, field-level edits.
 * The tool shares the user's single operation: while the user drags, the tool
 * waits briefly and then returns a structured `busy` error.
 */
export class ToolsCollaborationGuard implements McpEditorToolGuard {
  private readonly parts: ToolsCollaborationParts;

  /**
   * Creates the guard.
   *
   * @param parts Room services.
   */
  constructor(parts: ToolsCollaborationParts) {
    this.parts = parts;
  }

  /**
   * Runs one mutating tool.
   *
   * @param name Tool name.
   * @param invoke Runs the tool against the editor.
   * @returns Tool result, or a refusal.
   */
  async run(name: string, invoke: () => McpToolResult): Promise<McpToolResult> {
    const { sync, locks, history } = this.parts;
    if (!sync.isSynced()) return toolsCollaborationOffline();
    if (!(await this.idle())) return toolsCollaborationBusy();
    if (!sync.isSynced()) return toolsCollaborationOffline();
    sync.commit();
    locks.refusalTake();
    history.refusal = null;
    const rejected = sync.rejectionState().count;
    sync.holdSet(true);
    let result: McpToolResult;
    try {
      result = invoke();
    } catch (error) {
      sync.holdSet(false);
      throw error;
    }
    return this.finish(name, result, rejected);
  }

  /**
   * Waits until the local user has no running operation (one operation per
   * member at a time).
   *
   * @returns True once idle, false after the wait limit.
   */
  private async idle(): Promise<boolean> {
    const { sync } = this.parts;
    const until = performance.now() + TOOLS_COLLABORATION_BUSY_WAIT_MS;
    while (sync.lease.state() !== 'none') {
      sync.leaseIdle();
      if (sync.lease.state() === 'none') break;
      if (performance.now() >= until) return false;
      await new Promise((resolve) => setTimeout(resolve, TOOLS_COLLABORATION_BUSY_POLL_MS));
    }
    return true;
  }

  /**
   * Sends the tool's changes, or discards them when refused.
   *
   * @param name Tool name.
   * @param result Result the tool returned.
   * @param rejected Relay rejections counted before the tool ran.
   * @returns Final result.
   */
  private async finish(name: string, result: McpToolResult, rejected: number): Promise<McpToolResult> {
    const { sync, history } = this.parts;
    const touch = trackerCollaborationTouched(sync.replica);
    const refusal = this.blockFind(touch);
    sync.holdSet(false);
    if (refusal !== null) return this.discard(touch, refusal);
    if (!this.parts.sync.isSynced()) return toolsCollaborationOffline();
    sync.tracker.touch(touch.ids);
    sync.commit();
    await history.idle();
    const settled = await sync.settled();
    if (!settled) return toolsCollaborationOffline();
    return this.outcome(name, result, rejected);
  }

  /**
   * Reports relay rejections, refused history steps and refused selections.
   *
   * @param name Tool name.
   * @param result Result the tool returned.
   * @param rejected Relay rejections counted before the tool ran.
   * @returns Final result.
   */
  private async outcome(name: string, result: McpToolResult, rejected: number): Promise<McpToolResult> {
    const { sync, locks, history } = this.parts;
    const state = sync.rejectionState();
    if (state.count > rejected)
      return { ok: false, error: 'rejected', message: syncCollaborationRejection(state.reason) };
    if (history.refusal !== null) return history.refusal;
    void name;
    const refusal = locks.refusalTake();
    return refusal === null ? result : this.lockedResult(refusal);
  }

  /**
   * Finds a touched object, or a container a created or moved object entered,
   * that another member edits.
   *
   * @param touch Uncommitted changes.
   * @returns Refusal, or null.
   */
  private blockFind(touch: TrackerCollaborationTouch): LocksCollaborationRefusal | null {
    const { sync, locks } = this.parts;
    for (const object of touch.objects) {
      const refusal = locks.objectRefusal(object, 'edit');
      if (refusal !== null) return refusal;
    }
    const nodes = sync.replica.applier.nodes();
    for (const move of touch.moves) {
      const container = nodes.get(move.parent)?.object;
      const refusal = container === undefined ? null : locks.containerRefusal([move.object], container);
      if (refusal !== null) return refusal;
    }
    return this.deletedBlock(touch);
  }

  /**
   * Finds a deleted node another member holds.
   *
   * @param touch Uncommitted changes.
   * @returns Refusal, or null.
   */
  private deletedBlock(touch: TrackerCollaborationTouch): LocksCollaborationRefusal | null {
    const { sync, roster } = this.parts;
    const nodes = sync.replica.applier.nodes();
    const locks = sync.replica.locks;
    const id = touch.ids.find((entry) => nodes.get(entry) === undefined && locks.heldByOther(entry));
    if (id === undefined) return null;
    const holder = locks.holder(id) ?? -1;
    return { id, holder, message: `Can't delete an object ${roster.nameOf(holder)} is editing right now` };
  }

  /**
   * Throws the tool's changes away and returns the refusal.
   *
   * @param touch Uncommitted changes.
   * @param refusal Why the tool was refused.
   * @returns Locked result.
   */
  private discard(touch: TrackerCollaborationTouch, refusal: LocksCollaborationRefusal): McpToolResult {
    trackerCollaborationDiscard(this.parts.sync.replica, touch);
    this.parts.host.status(`${refusal.message}; the AI change was not applied`);
    this.parts.host.refresh();
    return this.lockedResult(refusal);
  }

  /**
   * Builds the structured result of a lock refusal.
   *
   * @param refusal Refusal.
   * @returns Locked result.
   */
  private lockedResult(refusal: LocksCollaborationRefusal): McpToolResult {
    const result: McpToolResult = { ok: false, error: 'locked', message: `${refusal.message}; nothing was changed` };
    const object = this.parts.locks.nodeName(refusal.id);
    if (object !== '') result.object = object;
    if (refusal.holder >= 0) result.holder = this.parts.roster.nameOf(refusal.holder);
    return result;
  }
}

/**
 * Result of a tool that cannot run because the room is not synchronized.
 *
 * @returns Offline result.
 */
export function toolsCollaborationOffline(): McpToolResult {
  return {
    ok: false,
    error: 'offline',
    message: 'The shared room is still synchronizing or the connection is down; nothing was changed',
  };
}

/**
 * Result of a tool refused because the local user is in the middle of an
 * operation (one operation per member at a time).
 *
 * @returns Busy result.
 */
export function toolsCollaborationBusy(): McpToolResult {
  return {
    ok: false,
    error: 'busy',
    message: 'The user is in the middle of an operation (dragging or editing); try again in a moment. Nothing was changed',
  };
}
