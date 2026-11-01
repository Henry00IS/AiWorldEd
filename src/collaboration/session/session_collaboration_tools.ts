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
import { locksCollaborationConflicts } from '@/collaboration/session/session_collaboration_locks.js';
import type { MemberCollaborationRoster } from '@/collaboration/sync/member_collaboration_roster.js';
import { selectionCollaborationChunks } from '@/collaboration/sync/selection_collaboration_locks.js';
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

/**
 * Runs AI (MCP) tools inside a room as the local user: the tool's changes are
 * held back, the objects it touched are locked all-or-nothing, the edit is sent
 * and confirmed, then the extra locks are released. Refusals return structured
 * errors and leave the scene unchanged.
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
   * Locks and sends the tool's changes, or discards them when refused.
   *
   * @param name Tool name.
   * @param result Result the tool returned.
   * @param rejected Relay rejections counted before the tool ran.
   * @returns Final result.
   */
  private async finish(name: string, result: McpToolResult, rejected: number): Promise<McpToolResult> {
    const { sync, history } = this.parts;
    const touch = trackerCollaborationTouched(sync.replica);
    const extra = touch.ids.filter((id) => sync.replica.locks.holder(id) === undefined);
    const refusal = this.blockFind(touch) ?? (await this.acquire(extra));
    sync.holdSet(false);
    if (refusal !== null) return this.discard(touch, extra, refusal);
    if (!this.parts.sync.isSynced()) return toolsCollaborationOffline();
    sync.commit();
    await history.idle();
    const settled = await sync.settled();
    this.release(extra);
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
    if (name === 'select') await locks.selectionSettled();
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
    return { id, holder, message: `Can't delete an object ${roster.nameOf(holder)} is editing` };
  }

  /**
   * Locks the touched nodes nobody holds, all-or-nothing.
   *
   * @param ids Ids to lock.
   * @returns Refusal when the relay refused a chunk or did not answer, else
   *   null.
   */
  private async acquire(ids: readonly string[]): Promise<LocksCollaborationRefusal | null> {
    const { transport, sync, roster } = this.parts;
    const locks = sync.replica.locks;
    for (const chunk of selectionCollaborationChunks([...ids], transport.limits.idsPerMessage)) {
      const reply = await transport.request({ t: 'lock.acquire', ids: chunk, replace: false }).catch(() => null);
      if (reply?.['ok'] === true) {
        locks.apply(locks.selfGet(), chunk, []);
        continue;
      }
      const conflict = locksCollaborationConflicts(reply?.['conflicts'])[0];
      const holder = conflict?.by ?? -1;
      const id = conflict?.id ?? chunk[0] ?? '';
      if (reply === null) return { id, holder, message: 'The relay did not answer the lock request' };
      const who = holder < 0 ? 'another member' : roster.nameOf(holder);
      return { id, holder, message: `${this.label(id)} or something inside it is being edited by ${who}` };
    }
    return null;
  }

  /**
   * Throws the tool's changes away and returns the refusal.
   *
   * @param touch Uncommitted changes.
   * @param extra Extra locks that may have been taken.
   * @param refusal Why the tool was refused.
   * @returns Locked result.
   */
  private discard(
    touch: TrackerCollaborationTouch,
    extra: readonly string[],
    refusal: LocksCollaborationRefusal,
  ): McpToolResult {
    trackerCollaborationDiscard(this.parts.sync.replica, touch);
    this.release(extra);
    this.parts.host.status(`${refusal.message}; the AI change was not applied`);
    this.parts.host.refresh();
    return this.lockedResult(refusal);
  }

  /**
   * Releases extra locks the selection does not need.
   *
   * @param ids Extra ids.
   */
  private release(ids: readonly string[]): void {
    const { transport, sync } = this.parts;
    const locks = sync.replica.locks;
    const requested = locks.requestedIds();
    const free = ids.filter((id) => !requested.has(id) && locks.holder(id) === locks.selfGet());
    if (free.length === 0) return;
    locks.apply(locks.selfGet(), [], free);
    selectionCollaborationChunks(free, transport.limits.idsPerMessage).forEach((chunk) =>
      transport.send({ t: 'lock.release', ids: chunk }),
    );
  }

  /**
   * Builds the structured result of a lock refusal.
   *
   * @param refusal Refusal.
   * @returns Locked result.
   */
  private lockedResult(refusal: LocksCollaborationRefusal): McpToolResult {
    const error = refusal.holder < 0 && refusal.message.startsWith('The relay') ? 'offline' : 'locked';
    const result: McpToolResult = { ok: false, error, message: `${refusal.message}; nothing was changed` };
    const object = this.parts.locks.nodeName(refusal.id);
    if (object !== '') result.object = object;
    if (refusal.holder >= 0) result.holder = this.parts.roster.nameOf(refusal.holder);
    return result;
  }

  /**
   * Quotes a node name.
   *
   * @param id Node id.
   * @returns Quoted name, or a fallback.
   */
  private label(id: string): string {
    const name = this.parts.locks.nodeName(id);
    return name === '' ? 'An object' : `"${name}"`;
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
