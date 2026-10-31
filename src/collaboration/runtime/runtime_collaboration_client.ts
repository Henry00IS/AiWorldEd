import type { HostCollaborationEditor } from '@/collaboration/host/host_collaboration_editor.js';
import { SocketCollaborationClient } from '@/collaboration/net/socket_collaboration_client.js';
import type {
  SocketCollaborationFactory,
  SocketCollaborationListener,
  SocketCollaborationMessage,
} from '@/collaboration/net/socket_collaboration_types.js';
import {
  RUNTIME_COLLABORATION_RECONNECT_CODES,
  runtimeCollaborationBackoff,
  runtimeCollaborationErrorText,
} from '@/collaboration/runtime/runtime_collaboration_errors.js';
import {
  SessionCollaborationRoom,
  type SessionCollaborationLockList,
} from '@/collaboration/session/session_collaboration_room.js';
import {
  sessionCollaborationMembersParse,
  sessionCollaborationRoomParse,
  sessionCollaborationSlot,
  sessionCollaborationStrings,
  type SessionCollaborationEvents,
  type SessionCollaborationMember,
  type SessionCollaborationRoomInfo,
} from '@/collaboration/session/session_collaboration_types.js';
import { displayNameFallback, displayNameNormalize } from '@/collaboration/shared/room_name_policy.js';
import { hierarchyNameAllocator } from '@/utils/utils_hierarchy_name_allocator.js';

/** Connection and room state shown in the UI. */
export type RuntimeCollaborationState =
  'offline' | 'connecting' | 'lobby' | 'joining' | 'syncing' | 'room' | 'reconnecting';

/** Most automatic reconnect attempts before giving up. */
export const RUNTIME_COLLABORATION_RECONNECT_ATTEMPTS = 8;

/** Receives runtime changes for the UI. */
export interface RuntimeCollaborationListener {
  /**
   * The state changed.
   *
   * @param state New state.
   */
  stateChanged(state: RuntimeCollaborationState): void;
  /** Members or locks changed. */
  rosterChanged(): void;
  /**
   * Something the user must read.
   *
   * @param title Dialog title.
   * @param message Explanation.
   * @param offline True when the user is now working offline and should save.
   */
  notice(title: string, message: string, offline: boolean): void;
}

/** Runtime configuration. */
export interface RuntimeCollaborationOptions {
  /** Returns the relay URL. */
  url(): string;
  /** Returns the display name. */
  name(): string;
  /** Creates sockets. */
  factory: SocketCollaborationFactory;
}

/** Relay traffic received between a join reply and the session start. */
type RuntimeCollaborationQueued = { message: SocketCollaborationMessage } | { frame: Uint8Array };

/**
 * Owns the relay connection and the current room: create, join, leave,
 * reconnect and the owner-left fallback to offline work.
 */
export class RuntimeCollaboration {
  state: RuntimeCollaborationState;
  room: SessionCollaborationRoomInfo | null;
  session: SessionCollaborationRoom | null;
  owner: boolean;
  private readonly host: HostCollaborationEditor;
  private readonly options: RuntimeCollaborationOptions;
  private readonly listener: RuntimeCollaborationListener;
  private readonly socketListener: SocketCollaborationListener;
  private readonly events: SessionCollaborationEvents;
  private client: SocketCollaborationClient | null;
  private queue: RuntimeCollaborationQueued[] | null;
  private rejoin: { room: string; password: string } | null;
  private reconnectAttempt: number;
  private reconnectTimer: ReturnType<typeof setTimeout> | null;

  /**
   * Creates a disconnected runtime.
   *
   * @param host Editor services.
   * @param options Relay configuration.
   * @param listener UI listener.
   */
  constructor(
    host: HostCollaborationEditor,
    options: RuntimeCollaborationOptions,
    listener: RuntimeCollaborationListener,
  ) {
    this.host = host;
    this.options = options;
    this.listener = listener;
    this.state = 'offline';
    this.room = null;
    this.session = null;
    this.owner = false;
    this.client = null;
    this.queue = null;
    this.rejoin = null;
    this.reconnectAttempt = 0;
    this.reconnectTimer = null;
    this.socketListener = runtimeCollaborationSocketListener(this);
    this.events = runtimeCollaborationEvents(this);
  }

  /**
   * Returns the own user id, or 0 when disconnected.
   *
   * @returns User id.
   */
  user(): number {
    return this.client?.user ?? 0;
  }

  /** Opens the connection when needed. */
  async connect(): Promise<void> {
    if (this.client !== null && this.client.isOpen()) return;
    this.reconnectCancel();
    this.stateSet('connecting');
    const client = new SocketCollaborationClient(this.options.factory, this.socketListener);
    this.client = client;
    try {
      await client.connect(this.options.url(), this.options.name());
    } catch (error) {
      if (this.client === client) this.client = null;
      client.close();
      this.stateSet('offline');
      throw error;
    }
    this.stateSet('lobby');
  }

  /**
   * Lists the rooms on the relay.
   *
   * @returns Rooms.
   */
  async rooms(): Promise<SessionCollaborationRoomInfo[]> {
    await this.connect();
    const reply = await this.clientGet().request({ t: 'room.list' });
    const rooms = Array.isArray(reply['rooms']) ? reply['rooms'] : [];
    return rooms.map(sessionCollaborationRoomParse).filter((room) => room !== null);
  }

  /**
   * Creates a room that shares the current scene.
   *
   * @param name Room name.
   * @param isPrivate True for a password-protected room.
   * @param password Password of a private room.
   */
  async create(name: string, isPrivate: boolean, password: string): Promise<void> {
    await this.connect();
    this.roomGuard();
    const access = isPrivate ? { private: true, password } : { private: false };
    const message = { t: 'room.create', name, ...access, ...runtimeCollaborationDisplayName(this.options.name()) };
    const reply = await this.clientGet().request(message);
    const self: SessionCollaborationMember = {
      user: this.user(),
      name: typeof reply['name'] === 'string' ? reply['name'] : displayNameFallback(this.user()),
      owner: true,
      color: sessionCollaborationSlot(reply['color']),
    };
    this.owner = true;
    this.rejoin = null;
    this.sessionStart(reply, [self], []);
  }

  /**
   * Joins a room, discarding the local scene once the relay accepted.
   *
   * @param room Room id.
   * @param password Password of a private room.
   */
  async join(room: string, password: string): Promise<void> {
    await this.connect();
    this.roomGuard();
    this.queue = [];
    this.stateSet('joining');
    try {
      const secret = password === '' ? {} : { password };
      const name = runtimeCollaborationDisplayName(this.options.name());
      const message = { t: 'room.join', room, discardLocalWork: true, ...secret, ...name };
      const reply = await this.clientGet().request(message);
      this.joined(reply, { room, password });
    } catch (error) {
      this.queue = null;
      if (this.state === 'joining') this.stateSet('lobby');
      throw error;
    }
  }

  /** Leaves the current room; the scene stays as it is. */
  async leave(): Promise<void> {
    if (this.session === null) return;
    this.sessionStop();
    this.rejoin = null;
    this.stateSet('lobby');
    await this.clientGet()
      .request({ t: 'room.leave' })
      .catch(() => undefined);
  }

  /** Leaves the room and closes the connection. */
  disconnect(): void {
    this.sessionStop();
    this.rejoin = null;
    this.reconnectCancel();
    this.client?.close();
    this.client = null;
    this.stateSet('offline');
  }

  /**
   * Routes an unsolicited relay message.
   *
   * @param message Relay message.
   */
  received(message: SocketCollaborationMessage): void {
    if (message.t === 'room.closed')
      this.roomEnded('Room closed', String(message['message'] ?? 'The room owner left.'), true);
    else if (message.t === 'room.left')
      this.roomEnded('Left the room', runtimeCollaborationLeftText(message['reason']), true);
    else if (this.session === null && this.queue !== null) this.queue.push({ message });
    else this.session?.message(message);
  }

  /**
   * Routes a binary frame.
   *
   * @param frame Frame bytes.
   */
  receivedBinary(frame: Uint8Array): void {
    if (this.session === null && this.queue !== null) this.queue.push({ frame });
    else this.session?.binary(frame);
  }

  /**
   * Handles a lost connection: tells the user and reconnects when sensible.
   *
   * @param code Close code.
   */
  connectionLost(code: number): void {
    const wasOwner = this.session !== null && this.owner;
    this.sessionStop();
    this.client = null;
    if (wasOwner) this.listener.notice('Connection lost', runtimeCollaborationOwnerLostText(), true);
    if (RUNTIME_COLLABORATION_RECONNECT_CODES.has(code)) this.reconnectSchedule();
    else this.offlineNotice(code);
  }

  /** Marks the room synchronized and lets new names avoid the room's names. */
  synced(): void {
    hierarchyNameAllocator.rebuildFromWorld(this.host.world);
    this.stateSet('room');
    this.host.status(`Connected to room "${this.room?.name ?? ''}"`);
  }

  /** Forwards a roster change. */
  rosterChanged(): void {
    this.listener.rosterChanged();
  }

  /**
   * Leaves after a synchronization failure.
   *
   * @param message Reason shown to the user.
   */
  failed(message: string): void {
    void this.leave().then(() => this.listener.notice('Synchronization failed', message, false));
  }

  /**
   * Starts the session after a successful join.
   *
   * @param reply Room.joined reply.
   * @param rejoin Credentials for automatic rejoin.
   */
  private joined(reply: SocketCollaborationMessage, rejoin: { room: string; password: string }): void {
    this.host.sceneDiscard();
    this.owner = false;
    this.rejoin = rejoin;
    this.stateSet('syncing');
    this.sessionStart(
      reply,
      sessionCollaborationMembersParse(reply['members']),
      runtimeCollaborationLocks(reply['locks']),
    );
  }

  /**
   * Creates and starts the room session, then replays queued traffic.
   *
   * @param reply Room.created or room.joined reply.
   * @param members Members.
   * @param locks Held locks.
   */
  private sessionStart(
    reply: SocketCollaborationMessage,
    members: SessionCollaborationMember[],
    locks: SessionCollaborationLockList[],
  ): void {
    this.room = sessionCollaborationRoomParse(reply['room']);
    const session = new SessionCollaborationRoom(this.host, this.clientGet(), this.events);
    this.session = session;
    session.start(typeof reply['you'] === 'number' ? reply['you'] : this.user(), this.owner, members, locks);
    const queued = this.queue ?? [];
    this.queue = null;
    queued.forEach((item) => ('frame' in item ? session.binary(item.frame) : this.received(item.message)));
    this.listener.rosterChanged();
  }

  /** Stops the current session. */
  private sessionStop(): void {
    this.queue = null;
    this.session?.stop();
    this.session = null;
    this.room = null;
    this.listener.rosterChanged();
  }

  /**
   * Ends the room after the relay closed it.
   *
   * @param title Dialog title.
   * @param message Explanation.
   * @param offline True when the scene stays as offline work.
   */
  private roomEnded(title: string, message: string, offline: boolean): void {
    if (this.session === null && this.queue === null) return;
    this.sessionStop();
    this.rejoin = null;
    this.stateSet('lobby');
    this.listener.notice(title, message, offline);
  }

  /** Schedules the next reconnect attempt. */
  private reconnectSchedule(): void {
    if (this.reconnectAttempt >= RUNTIME_COLLABORATION_RECONNECT_ATTEMPTS) return this.offlineNotice(1006);
    this.stateSet('reconnecting');
    const delay = runtimeCollaborationBackoff(this.reconnectAttempt);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => void this.reconnectRun(), delay);
  }

  /** Reconnects and rejoins the previous room, discarding local work. */
  private async reconnectRun(): Promise<void> {
    this.reconnectTimer = null;
    try {
      await this.connect();
    } catch {
      return this.reconnectSchedule();
    }
    this.reconnectAttempt = 0;
    const rejoin = this.rejoin;
    if (rejoin === null) return;
    this.rejoin = null;
    try {
      await this.join(rejoin.room, rejoin.password);
      this.host.status('Reconnected; the room scene replaced changes made while disconnected');
    } catch (error) {
      this.listener.notice('Could not rejoin the room', runtimeCollaborationErrorText(error), true);
    }
  }

  /** Cancels a pending reconnect. */
  private reconnectCancel(): void {
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.reconnectAttempt = 0;
  }

  /**
   * Goes offline and explains why.
   *
   * @param code Close code.
   */
  private offlineNotice(code: number): void {
    this.rejoin = null;
    this.stateSet('offline');
    this.listener.notice('Disconnected', runtimeCollaborationCloseText(code), true);
  }

  /** Refuses room changes while already in a room. */
  private roomGuard(): void {
    if (this.session !== null || this.queue !== null) throw new Error('already_in_room');
  }

  /**
   * Returns the open client.
   *
   * @returns Client.
   */
  private clientGet(): SocketCollaborationClient {
    if (this.client === null) throw new Error('closed');
    return this.client;
  }

  /**
   * Changes the state and informs the UI.
   *
   * @param state New state.
   */
  private stateSet(state: RuntimeCollaborationState): void {
    if (this.state === state) return;
    this.state = state;
    this.listener.stateChanged(state);
  }
}

/**
 * Builds the socket listener of a runtime.
 *
 * @param runtime Runtime.
 * @returns Listener.
 */
function runtimeCollaborationSocketListener(runtime: RuntimeCollaboration): SocketCollaborationListener {
  return {
    message: (message) => runtime.received(message),
    binary: (frame) => runtime.receivedBinary(frame),
    closed: (code) => runtime.connectionLost(code),
  };
}

/**
 * Builds the session events of a runtime.
 *
 * @param runtime Runtime.
 * @returns Events.
 */
function runtimeCollaborationEvents(runtime: RuntimeCollaboration): SessionCollaborationEvents {
  return {
    synced: () => runtime.synced(),
    rosterChanged: () => runtime.rosterChanged(),
    failed: (message) => runtime.failed(message),
  };
}

/**
 * Parses the lock lists of room.joined.
 *
 * @param value Untrusted value.
 * @returns Lock lists.
 */
export function runtimeCollaborationLocks(value: unknown): SessionCollaborationLockList[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item: unknown): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .filter((item) => typeof item['by'] === 'number')
    .map((item) => ({ by: Number(item['by']), ids: sessionCollaborationStrings(item['ids']) }));
}

/**
 * Builds the optional displayName field of room.create and room.join.
 *
 * @param name Stored display name.
 * @returns Field object, empty when the name is blank.
 */
export function runtimeCollaborationDisplayName(name: string): { displayName?: string } {
  const normalized = displayNameNormalize(name);
  return normalized.ok ? { displayName: normalized.name } : {};
}

/**
 * Explains a room.left reason.
 *
 * @param reason Untrusted reason.
 * @returns Message.
 */
export function runtimeCollaborationLeftText(reason: unknown): string {
  if (reason === 'snapshot_timeout') return 'The room owner did not send the scene in time. Try joining again.';
  if (reason === 'snapshot_failed') return 'The room owner could not send the scene. Try joining again.';
  if (reason === 'closed') return 'The room was closed.';
  return 'You left the room.';
}

/**
 * Explains why an owner lost their room.
 *
 * @returns Message.
 */
function runtimeCollaborationOwnerLostText(): string {
  return 'The connection to the server was lost, so your room was closed for everyone. Your scene is still here; save it locally.';
}

/**
 * Explains a close code.
 *
 * @param code Close code.
 * @returns Message.
 */
export function runtimeCollaborationCloseText(code: number): string {
  if (code === 4002) return 'The server disconnected you for sending too much too quickly.';
  if (code === 4005) return 'The server is full. Try again later.';
  if (code === 4001) return 'The server rejected a message from this editor (protocol violation).';
  return 'The connection to the collaboration server was lost. You are working offline.';
}
