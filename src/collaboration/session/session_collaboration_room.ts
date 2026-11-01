import type { HostCollaborationEditor } from '@/collaboration/host/host_collaboration_editor.js';
import type { SocketCollaborationMessage } from '@/collaboration/net/socket_collaboration_types.js';
import { PresenceCollaborationSession } from '@/collaboration/presence/session_collaboration_presence.js';
import { HistoryCollaborationObserver } from '@/collaboration/session/session_collaboration_history.js';
import { LocksCollaborationSession } from '@/collaboration/session/session_collaboration_locks.js';
import { ToolsCollaborationGuard } from '@/collaboration/session/session_collaboration_tools.js';
import { StreamsCollaborationSession } from '@/collaboration/session/session_collaboration_streams.js';
import {
  SyncCollaborationSession,
  type SyncCollaborationRemoteEdit,
} from '@/collaboration/session/session_collaboration_sync.js';
import {
  sessionCollaborationSlot,
  sessionCollaborationStrings,
  type SessionCollaborationEvents,
  type SessionCollaborationMember,
  type SessionCollaborationTransport,
} from '@/collaboration/session/session_collaboration_types.js';
import { VisualsCollaborationSession } from '@/collaboration/session/session_collaboration_visuals.js';
import { LIVE_COLLABORATION_INTERVAL_MS } from '@/collaboration/sync/live_collaboration_ticker.js';
import { MemberCollaborationRoster } from '@/collaboration/sync/member_collaboration_roster.js';
import { getTextureMapCache } from '@/texture/library/texture_map_cache.js';
import { textureSourceGateSet } from '@/texture/library/texture_source_gate.js';
import { BINARY_FRAME_KIND_PRESENCE, type EditOperation } from '@/collaboration/shared/protocol_definitions.js';

/** Interval of the safety commit that catches edits made outside commands. */
export const SESSION_COLLABORATION_POLL_MS = 250;
/** Shown when a member tries to open a local texture folder. */
export const SESSION_COLLABORATION_TEXTURE_SOURCE_MESSAGE =
  'Only the room owner provides textures. Leave the room to open your own folder.';
/** Delay used to coalesce overlay updates. */
const SESSION_COLLABORATION_VISUALS_MS = 16;

/** Lock list entry of room.joined. */
export interface SessionCollaborationLockList {
  by: number;
  ids: string[];
}

/**
 * One joined room: wires selection locks, per-user history, the edit loop,
 * streams and overlays into the editor, and dispatches room messages.
 */
export class SessionCollaborationRoom {
  readonly roster: MemberCollaborationRoster;
  readonly sync: SyncCollaborationSession;
  readonly locks: LocksCollaborationSession;
  readonly history: HistoryCollaborationObserver;
  readonly streams: StreamsCollaborationSession;
  readonly visuals: VisualsCollaborationSession;
  readonly presence: PresenceCollaborationSession;
  readonly tools: ToolsCollaborationGuard;
  private readonly host: HostCollaborationEditor;
  private readonly events: SessionCollaborationEvents;
  private readonly timers: ReturnType<typeof setInterval>[];
  private readonly pointerListener: (event: PointerEvent) => void;
  private visualsTimer: ReturnType<typeof setTimeout> | null;
  private pointersDown: number;
  private running: boolean;
  private self: number;
  private owner: boolean;

  /**
   * Creates the room session.
   *
   * @param host Editor services.
   * @param transport Relay connection.
   * @param events Runtime notifications.
   */
  constructor(
    host: HostCollaborationEditor,
    transport: SessionCollaborationTransport,
    events: SessionCollaborationEvents,
  ) {
    this.host = host;
    this.roster = new MemberCollaborationRoster();
    this.sync = new SyncCollaborationSession(host, transport);
    const changed = (): void => this.visualsSchedule();
    this.locks = new LocksCollaborationSession(host, transport, this.sync, this.roster, changed);
    this.history = new HistoryCollaborationObserver(host, transport, this.sync, this.roster);
    this.events = { ...events, synced: () => this.synced(events) };
    this.streams = new StreamsCollaborationSession(host, transport, this.sync, this.events);
    this.visuals = new VisualsCollaborationSession(host, this.sync, this.roster);
    this.presence = new PresenceCollaborationSession(host, transport, this.roster);
    const parts = { host, transport, sync: this.sync, locks: this.locks, history: this.history, roster: this.roster };
    this.tools = new ToolsCollaborationGuard(parts);
    this.timers = [];
    this.pointerListener = (event) => this.pointerTrack(event);
    this.visualsTimer = null;
    this.pointersDown = 0;
    this.running = false;
    this.self = -1;
    this.owner = false;
  }

  /**
   * Hooks the room into the editor. The owner is synchronized immediately; a
   * joiner waits for the snapshot.
   *
   * @param self Own user id.
   * @param owner True when this client created the room.
   * @param members Current members.
   * @param locks Locks held when joining.
   */
  start(
    self: number,
    owner: boolean,
    members: SessionCollaborationMember[],
    locks: SessionCollaborationLockList[],
  ): void {
    this.running = true;
    this.self = self;
    this.sync.replica.locks.selfSet(self);
    members.forEach((member) => this.roster.upsert(member.user, member.name, member.owner, member.color));
    locks.forEach((entry) => this.sync.replica.locks.apply(entry.by, entry.ids, []));
    this.host.commandStack.clear();
    this.host.commandStack.observerSet(this.history);
    this.locks.install();
    this.host.toolGuardSet(this.tools);
    this.texturesStart(owner);
    this.listenersAdd();
    if (owner) {
      this.sync.ownerStart();
      this.events.synced();
    }
  }

  /** Unhooks the room from the editor; the scene stays as it is. */
  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.listenersRemove();
    this.locks.uninstall();
    this.host.toolGuardSet(null);
    textureSourceGateSet(null);
    this.host.commandStack.observerSet(null);
    this.host.commandStack.clear();
    this.visuals.dispose();
    this.presence.stop();
    this.streams.clear();
    this.sync.clear();
    this.roster.clear();
  }

  /**
   * Dispatches a room message.
   *
   * @param message Relay message.
   */
  message(message: SocketCollaborationMessage): void {
    if (!this.running) return;
    if (message.t.startsWith('stream.')) this.streams.message(message);
    else if (message.t === 'edits') this.edits(message['list']);
    else if (message.t === 'edit.rejected') this.rejected(message);
    else if (message.t === 'verify') this.sync.verify(message);
    else if (message.t === 'locks') this.lockBroadcast(message);
    else this.membership(message);
  }

  /**
   * Reverts an edit the relay rejected.
   *
   * @param message Relay rejection.
   */
  private rejected(message: SocketCollaborationMessage): void {
    this.sync.rejected(Number(message['seq']), String(message['reason'] ?? ''), String(message['why'] ?? ''));
  }

  /**
   * Routes a binary frame to presence or the stream receiver.
   *
   * @param frame Binary frame.
   */
  binary(frame: Uint8Array): void {
    if (!this.running) return;
    if (frame[1] === BINARY_FRAME_KIND_PRESENCE) this.presence.binary(frame);
    else this.streams.binary(frame);
  }

  /**
   * Handles membership, snapshot and asset messages.
   *
   * @param message Relay message.
   */
  private membership(message: SocketCollaborationMessage): void {
    const user = typeof message['user'] === 'number' ? message['user'] : -1;
    if (message.t === 'member.joined')
      this.memberJoined(user, String(message['name'] ?? ''), sessionCollaborationSlot(message['color']));
    else if (message.t === 'member.left') this.memberLeft(user);
    else if (message.t === 'snapshot.request' && typeof message['for'] === 'number')
      this.streams.snapshotServe(message['for']);
    else if (
      message.t === 'asset.request' &&
      typeof message['from'] === 'number' &&
      typeof message['name'] === 'string'
    )
      this.streams.textures.serveQueue(message['from'], message['name']);
    else if (message.t === 'asset.missing' && typeof message['name'] === 'string')
      this.streams.textures.settle(message['name']);
  }

  /**
   * Adds a member.
   *
   * @param user Member id.
   * @param name Display name.
   * @param slot Color slot.
   */
  private memberJoined(user: number, name: string, slot: number): void {
    this.roster.upsert(user, name, false, slot);
    if (this.owner) this.streams.textures.memberJoined(user);
    this.events.rosterChanged();
  }

  /**
   * Removes a member, their locks, streams and presence.
   *
   * @param user Member id.
   */
  private memberLeft(user: number): void {
    this.roster.remove(user);
    const held = this.sync.replica.locks.idsOf(user);
    this.sync.replica.locks.userClear(user);
    this.sync.previewRestore(held);
    this.streams.memberLeft(user);
    this.presence.memberLeft(user);
    this.visualsSchedule();
    this.events.rosterChanged();
  }

  /**
   * Applies relayed edits.
   *
   * @param value Untrusted edit list.
   */
  private edits(value: unknown): void {
    const list = sessionCollaborationEdits(value);
    this.sync.remoteEdits(list);
    if (!this.sync.isSynced()) return;
    list.forEach((edit) => this.streams.texturesForOps(edit.ops));
    this.visualsSchedule();
  }

  /**
   * Applies a lock broadcast.
   *
   * @param message Locks message.
   */
  private lockBroadcast(message: SocketCollaborationMessage): void {
    if (typeof message['by'] !== 'number') return;
    const removed = sessionCollaborationStrings(message['remove']);
    this.locks.remoteLocks(message['by'], sessionCollaborationStrings(message['add']), removed);
    this.sync.previewRestore(removed);
  }

  /**
   * Finishes synchronization: locks the current selection, starts presence and
   * draws overlays.
   *
   * @param events Runtime notifications.
   */
  private synced(events: SessionCollaborationEvents): void {
    if (!this.running) return;
    this.locks.selectionResend();
    this.presence.start(this.self);
    this.visualsSchedule();
    events.synced();
  }

  /** Starts timers and pointer tracking. */
  private listenersAdd(): void {
    this.timers.push(setInterval(() => this.poll(), SESSION_COLLABORATION_POLL_MS));
    this.timers.push(setInterval(() => this.sync.liveTick(), LIVE_COLLABORATION_INTERVAL_MS));
    if (typeof window === 'undefined') return;
    ['pointerdown', 'pointerup', 'pointercancel'].forEach((type) =>
      window.addEventListener(type, this.pointerListener as EventListener, true),
    );
  }

  /** Stops timers and pointer tracking. */
  private listenersRemove(): void {
    this.timers.splice(0, this.timers.length).forEach((timer) => clearInterval(timer));
    if (this.visualsTimer !== null) clearTimeout(this.visualsTimer);
    this.visualsTimer = null;
    if (typeof window === 'undefined') return;
    ['pointerdown', 'pointerup', 'pointercancel'].forEach((type) =>
      window.removeEventListener(type, this.pointerListener as EventListener, true),
    );
  }

  /**
   * Counts pressed pointers so the poll never commits half a drag.
   *
   * @param event Pointer event.
   */
  private pointerTrack(event: PointerEvent): void {
    this.pointersDown = event.type === 'pointerdown' ? this.pointersDown + 1 : Math.max(0, this.pointersDown - 1);
    if (event.type !== 'pointerdown' && this.pointersDown === 0) this.poll();
  }

  /**
   * Makes the owner the room's only texture source: a member starts from an
   * empty library that fills with the owner's textures, and may not open a
   * local folder until it leaves.
   *
   * @param owner True when this client owns the room.
   */
  private texturesStart(owner: boolean): void {
    this.owner = owner;
    if (owner) return textureSourceGateSet(null);
    textureSourceGateSet(() => SESSION_COLLABORATION_TEXTURE_SOURCE_MESSAGE);
    this.host.textureLibrary()?.clear();
    getTextureMapCache().pruneMissingLibraryEntries();
  }

  /**
   * Commits edits made outside commands (panels, scripts) while idle, and lets
   * the owner notice a texture folder switch.
   */
  private poll(): void {
    if (this.pointersDown === 0) this.sync.commit();
    if (this.owner) this.streams.textures.revisionPoll();
  }

  /** Coalesces overlay and lock-count updates. */
  private visualsSchedule(): void {
    if (this.visualsTimer !== null || !this.running) return;
    this.visualsTimer = setTimeout(() => {
      this.visualsTimer = null;
      if (!this.running || !this.sync.isSynced()) return;
      this.visuals.update();
      this.events.rosterChanged();
    }, SESSION_COLLABORATION_VISUALS_MS);
  }
}

/**
 * Parses relayed edits.
 *
 * @param value Untrusted list.
 * @returns Valid edits in relay order.
 */
export function sessionCollaborationEdits(value: unknown): SyncCollaborationRemoteEdit[] {
  if (!Array.isArray(value)) return [];
  const list: SyncCollaborationRemoteEdit[] = [];
  value.forEach((item: unknown) => {
    const edit = item as { from?: unknown; seq?: unknown; ops?: unknown } | null;
    if (typeof edit?.from !== 'number' || !Array.isArray(edit.ops)) return;
    list.push({ from: edit.from, seq: Number(edit.seq), ops: edit.ops as EditOperation[] });
  });
  return list;
}
