import type { CompatibilityIdentity } from '@/collaboration/shared/compatibility_identity.js';
import { CustomCollaborationChannel } from '@/collaboration/forks/custom_collaboration_channel.js';
import {
  COLLABORATION_EDITOR_HOME,
  COLLABORATION_EDITOR_VERSION,
  collaborationIdentityMatches,
} from '@/collaboration/forks/identity_collaboration_editor.js';
import type { HostCollaborationEditor } from '@/collaboration/host/host_collaboration_editor.js';
import { SocketCollaborationClient } from '@/collaboration/net/socket_collaboration_client.js';
import {
  SOCKET_COLLABORATION_LIMITS_DEFAULT,
  SocketCollaborationError,
  type SocketCollaborationFactory,
  type SocketCollaborationListener,
  type SocketCollaborationLimits,
  type SocketCollaborationMessage,
} from '@/collaboration/net/socket_collaboration_types.js';
import {
  RUNTIME_COLLABORATION_RECONNECT_CODES,
  runtimeCollaborationErrorText,
  runtimeCollaborationRetryDelay,
} from '@/collaboration/runtime/runtime_collaboration_errors.js';
import {
  RUNTIME_COLLABORATION_PERMANENT_CODES,
  runtimeCollaborationClosedErrorText,
  runtimeCollaborationCloseText,
  runtimeCollaborationRefusalIs,
} from '@/collaboration/runtime/runtime_collaboration_close_text.js';
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
import {
  RuntimeCollaborationRoomsWatch,
  runtimeCollaborationRoomsParse,
  type RuntimeCollaborationRoomsWatcher,
} from '@/collaboration/runtime/runtime_collaboration_rooms_watch.js';
import {
  HostCollaborationTransfer,
  hostCollaborationTransferUrl,
  type HostCollaborationTransferShared,
} from '@/collaboration/transfer/host_collaboration_transfer.js';
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
  /**
   * A chat message from another member of the current room.
   *
   * @param message Untrusted `chat` message.
   */
  chat?(message: SocketCollaborationMessage): void;
  /**
   * Typing presence for the current room.
   *
   * @param message Untrusted `typing` message.
   */
  typing?(message: SocketCollaborationMessage): void;
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
  /**
   * General fork channel; edits remain the primary scene undo/snapshot/merge
   * path.
   */
  readonly custom = new CustomCollaborationChannel(
    () => this.clientGet(),
    () => this.state === 'room',
    () => this.owner,
  );
  state: RuntimeCollaborationState;
  room: SessionCollaborationRoomInfo | null;
  session: SessionCollaborationRoom | null;
  owner: boolean;
  password: string;
  /**
   * Open relay connections worldwide, or null when the relay does not report
   * them.
   */
  worldwide: number | null = null;
  private readonly host: HostCollaborationEditor;
  private readonly options: RuntimeCollaborationOptions;
  private readonly listener: RuntimeCollaborationListener;
  private readonly socketListener: SocketCollaborationListener;
  private readonly events: SessionCollaborationEvents;
  private client: SocketCollaborationClient | null;
  private queue: RuntimeCollaborationQueued[] | null;
  private rejoin: { room: string; password: string } | null;
  private statusShown: string;
  private reconnectAttempt: number;
  private reconnectTimer: ReturnType<typeof setTimeout> | null;
  private reconnectNext: (() => void) | null = null;
  private attemptAt = -Infinity;
  private halted = false;
  private refusal = 0;
  private readonly roomsWatch: RuntimeCollaborationRoomsWatch;
  private transfer: { client: SocketCollaborationClient; host: HostCollaborationTransfer } | null = null;
  private opening: Promise<void> | null = null;
  private keepOnline = false;

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
    this.password = '';
    this.client = null;
    this.queue = null;
    this.rejoin = null;
    this.statusShown = '';
    this.reconnectAttempt = 0;
    this.reconnectTimer = null;
    this.roomsWatch = new RuntimeCollaborationRoomsWatch();
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

  /**
   * Opens the connection when needed; concurrent callers share one opening
   * connection.
   *
   * @returns Resolves once connected.
   */
  async connect(): Promise<void> {
    if (this.client !== null && this.client.isOpen()) return;
    if (this.opening !== null) return this.opening;
    await this.connectOpen();
  }

  /**
   * Keeps the editor connected outside rooms too: connects now and reconnects
   * in the background whenever the connection drops, until disconnect().
   */
  keepConnected(): void {
    this.keepOnline = true;
    this.halted = false;
    this.connect().catch((error: unknown) => this.idleFailed(error));
  }

  /**
   * Returns whether the runtime tries to stay online.
   *
   * @returns False after disconnect() or a permanent refusal.
   */
  online(): boolean {
    return this.keepOnline && !this.halted;
  }

  /**
   * Drops the current connection (outside rooms only) and connects again at
   * once, for example to a changed relay URL. Events of the old connection are
   * ignored.
   */
  reconnectNow(): void {
    if (this.session !== null || this.queue !== null) return;
    const client = this.client;
    this.client = null;
    this.opening = null;
    client?.close();
    this.reconnectCancel();
    this.reconnectAttempt = 0;
    this.refusal = 0;
    this.attemptAt = -Infinity;
    this.keepConnected();
  }

  /**
   * Brings a pending retry forward, within the cooldown, when the network
   * returns or the tab wakes up.
   */
  retryNow(): void {
    if (!this.online()) return;
    const next = this.reconnectNext;
    if (next !== null) return this.timerSet(next);
    if (this.client === null && this.opening === null) this.idleReconnect();
  }

  /**
   * Opens a new connection and remembers it as the opening one.
   *
   * @returns Resolves once connected.
   */
  private connectOpen(): Promise<void> {
    const opening = this.connectRun().finally(() => {
      if (this.opening === opening) this.opening = null;
    });
    this.opening = opening;
    return opening;
  }

  /** Opens a new connection. */
  private async connectRun(): Promise<void> {
    this.attemptAt = Date.now();
    this.stateSet('connecting');
    const listener = this.socketListener;
    const client: SocketCollaborationClient = new SocketCollaborationClient(this.options.factory, {
      message: (message) => {
        if (this.client === client) listener.message(message);
      },
      binary: (frame) => {
        if (this.client === client) listener.binary(frame);
      },
      closed: (code, reason) => {
        if (this.client === client) listener.closed(code, reason);
      },
    });
    this.client = client;
    try {
      this.worldwide = (await client.connect(this.options.url(), this.options.name())).online ?? null;
    } catch (error) {
      if (this.client === client) this.connectFailed();
      client.close();
      throw error;
    }
    if (this.client !== client) throw new Error('closed');
    this.stateSet('lobby');
  }

  /** Forgets a connection whose handshake failed. */
  private connectFailed(): void {
    this.client = null;
    this.stateSet('offline');
  }

  /**
   * Lists the rooms on the relay.
   *
   * @returns Rooms.
   */
  async rooms(): Promise<SessionCollaborationRoomInfo[]> {
    await this.connect();
    const reply = await this.clientGet().request({ t: 'room.list' });
    return runtimeCollaborationRoomsParse(reply['rooms']);
  }

  /**
   * Subscribes to the live room list: the watcher gets the full list now and
   * again after every change the relay pushes, until roomsUnwatch() or a
   * dropped connection.
   *
   * @param watcher Receives the list.
   */
  async roomsWatchStart(watcher: RuntimeCollaborationRoomsWatcher): Promise<void> {
    await this.connect();
    this.roomsWatch.stop();
    const reply = await this.clientGet().request({ t: 'room.subscribe' });
    this.roomsWatch.start(watcher, reply);
  }

  /** Ends the live room list subscription, if any. */
  roomsUnwatch(): void {
    if (!this.roomsWatch.active()) return;
    this.roomsWatch.stop();
    if (this.client !== null && this.client.isOpen()) this.client.request({ t: 'room.unsubscribe' }).catch(() => {});
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
    const client = this.clientGet();
    const message = {
      t: 'room.create',
      name,
      ...access,
      ...runtimeCollaborationDisplayName(this.options.name(), client.limits),
    };
    const reply = await client.request(message);
    const self: SessionCollaborationMember = {
      user: this.user(),
      name: typeof reply['name'] === 'string' ? reply['name'] : displayNameFallback(this.user()),
      owner: true,
      color: sessionCollaborationSlot(reply['color']),
    };
    this.owner = true;
    this.password = isPrivate ? password : '';
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
      const name = runtimeCollaborationDisplayName(this.options.name(), this.clientGet().limits);
      const message = {
        t: 'room.join',
        room,
        discardLocalWork: true,
        compatibility: {
          version: COLLABORATION_EDITOR_VERSION,
          homeUrl: COLLABORATION_EDITOR_HOME,
        },
        ...secret,
        ...name,
      };
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
    this.keepOnline = false;
    this.halted = false;
    this.sessionStop();
    this.rejoin = null;
    this.reconnectCancel();
    this.reconnectAttempt = 0;
    this.opening = null;
    this.client?.close();
    this.client = null;
    this.stateSet('offline');
  }

  /**
   * Stores the relay's live connection count and redraws the status.
   *
   * @param online Untrusted count from a `stats` message.
   */
  private onlineSet(online: unknown): void {
    if (typeof online !== 'number' || !Number.isSafeInteger(online) || online < 0) return;
    this.worldwide = online;
    this.listener.rosterChanged();
  }

  /**
   * Routes an unsolicited relay message.
   *
   * @param message Relay message.
   */
  received(message: SocketCollaborationMessage): void {
    if (message.t === 'compatibility.check') return this.compatibilityRespond(message);
    if (this.transfer?.client === this.client && this.transfer.host.handle(message)) return;
    if (message.t === 'stats') this.onlineSet(message['online']);
    else if (message.t === 'room.list.update') this.roomsWatch.apply(message);
    else if (message.t === 'room.closed')
      this.roomEnded('Room closed', String(message['message'] ?? 'The room owner left.'), true);
    else if (message.t === 'room.left')
      this.roomEnded('Left the room', runtimeCollaborationLeftText(message['reason']), true);
    else if (this.session === null && this.queue !== null) this.queue.push({ message });
    else if (message.t === 'chat') this.chatReceived(message);
    else if (message.t === 'typing') this.typingReceived(message);
    else this.session?.message(message);
  }

  /**
   * Answers an owner-directed admission query by exact editor identity.
   *
   * @param message Bounded relay compatibility check.
   */
  private compatibilityRespond(message: SocketCollaborationMessage): void {
    if (!this.owner || this.session === null) return;
    const allow = collaborationIdentityMatches(message['compatibility'] as CompatibilityIdentity);
    this.clientGet().send({
      t: 'compatibility.result',
      q: message['q'],
      allow,
      ...(!allow ? { reason: 'incompatible_client', homeUrl: COLLABORATION_EDITOR_HOME } : {}),
    });
  }

  /**
   * Routes a binary frame.
   *
   * @param frame Frame bytes.
   */
  receivedBinary(frame: Uint8Array): void {
    if (this.custom.receive(frame)) return;
    if (this.session === null && this.queue !== null) this.queue.push({ frame });
    else this.session?.binary(frame);
  }

  /**
   * Handles a lost connection: tells the user and reconnects when sensible.
   *
   * @param code Close code.
   */
  connectionLost(code: number): void {
    if (this.state === 'connecting') return;
    this.roomsWatch.lose(new Error(`connection lost, code ${code}`));
    const inRoom = this.session !== null || this.queue !== null;
    const wasOwner = this.session !== null && this.owner;
    this.sessionStop();
    this.client = null;
    if (!inRoom) {
      this.rejoin = null;
      this.reconnectCancel();
      this.stateSet('offline');
      this.status('Disconnected from the collaboration server; reconnecting');
      this.idleReconnect();
      return;
    }
    if (wasOwner) this.listener.notice('Connection lost', runtimeCollaborationOwnerLostText(), true);
    if (RUNTIME_COLLABORATION_RECONNECT_CODES.has(code)) this.reconnectSchedule();
    else this.offlineNotice(code);
  }

  /**
   * Shows a connection status that is cleared again on the next state change.
   *
   * @param message Message, or an empty string to only clear the previous one.
   */
  status(message: string): void {
    this.host.statusRetract(this.statusShown);
    this.statusShown = message;
    if (message !== '') this.host.status(message);
  }

  /** Marks the room synchronized and lets new names avoid the room's names. */
  synced(): void {
    hierarchyNameAllocator.rebuildFromWorld(this.host.world);
    this.stateSet('room');
    this.status(`Connected to room "${this.room?.name ?? ''}"`);
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
    this.password = rejoin.password;
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
    this.password = '';
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

  /** Schedules the next attempt to reconnect and rejoin the room. */
  private reconnectSchedule(): void {
    if (this.reconnectAttempt >= RUNTIME_COLLABORATION_RECONNECT_ATTEMPTS) return this.offlineNotice(1006);
    this.stateSet('reconnecting');
    this.reconnectAttempt += 1;
    this.timerSet(() => void this.reconnectRun());
  }

  /** Reconnects and rejoins the previous room, discarding local work. */
  private async reconnectRun(): Promise<void> {
    try {
      await this.connect();
    } catch (error) {
      if (runtimeCollaborationRefusalIs(error))
        return this.offlineNotice(error.closeCode, runtimeCollaborationClosedErrorText(error));
      return this.reconnectSchedule();
    }
    this.reconnectAttempt = 0;
    const rejoin = this.rejoin;
    if (rejoin === null) return;
    this.rejoin = null;
    try {
      await this.join(rejoin.room, rejoin.password);
      this.status('Reconnected; the room scene replaced changes made while disconnected');
    } catch (error) {
      this.listener.notice('Could not rejoin the room', runtimeCollaborationErrorText(error), true);
    }
  }

  /** Reconnects in the background after the cooldown while kept online. */
  private idleReconnect(): void {
    if (!this.online() || this.reconnectTimer !== null) return;
    this.timerSet(() => {
      this.connect().then(
        () => (this.refusal = 0),
        (error: unknown) => this.idleFailed(error),
      );
    });
  }

  /**
   * Handles a failed background attempt: a refusal is shown once, and one that
   * a retry cannot fix stops the retries until the user connects again.
   *
   * @param error Thrown value.
   */
  private idleFailed(error: unknown): void {
    if (!runtimeCollaborationRefusalIs(error)) return this.idleReconnect();
    if (error.closeCode !== this.refusal)
      this.listener.notice('Connection refused', runtimeCollaborationClosedErrorText(error), false);
    this.refusal = error.closeCode;
    if (RUNTIME_COLLABORATION_PERMANENT_CODES.has(error.closeCode)) this.halt();
    else this.idleReconnect();
  }

  /** Stops retrying after a permanent refusal. */
  private halt(): void {
    this.halted = true;
    this.reconnectCancel();
    this.listener.stateChanged(this.state);
  }

  /**
   * Runs an attempt once the cooldown since the last attempt has passed.
   *
   * @param run Attempt.
   */
  private timerSet(run: () => void): void {
    this.reconnectCancel();
    this.reconnectNext = run;
    this.reconnectTimer = setTimeout(
      () => {
        this.reconnectTimer = null;
        this.reconnectNext = null;
        run();
      },
      runtimeCollaborationRetryDelay(this.attemptAt, Date.now()),
    );
  }

  /** Cancels a pending reconnect. */
  private reconnectCancel(): void {
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.reconnectNext = null;
  }

  /**
   * Leaves the room for good and explains why; the connection is retried unless
   * the relay refused it permanently.
   *
   * @param code Close code.
   * @param text Explanation; defaults to the text of the close code.
   */
  private offlineNotice(code: number, text: string = runtimeCollaborationCloseText(code)): void {
    this.rejoin = null;
    this.stateSet('offline');
    this.listener.notice('Disconnected', text, true);
    if (RUNTIME_COLLABORATION_PERMANENT_CODES.has(code)) this.halt();
    else this.idleReconnect();
  }

  /** Refuses room changes while already in a room. */
  private roomGuard(): void {
    if (this.session !== null || this.queue !== null) throw new Error('already_in_room');
  }

  /**
   * Sends a chat message to the current room.
   *
   * @param text Raw text; the relay cleans and checks it.
   * @returns The relay's `chat.sent` reply.
   */
  async chatSend(text: string): Promise<SocketCollaborationMessage> {
    return this.clientGet().request({ t: 'chat', text });
  }

  /**
   * Shares a file as a transfer link of this connection and posts it to the
   * room chat. The file stays in memory until the connection ends or the link
   * expires.
   *
   * @param file Picked file.
   * @returns The relay's `chat.sent` reply.
   */
  async chatShare(file: File): Promise<SocketCollaborationMessage> {
    const shared = await this.transferShare(file, file.name);
    return this.clientGet().request({ t: 'chat', text: shared.name, file: { ...shared } });
  }

  /**
   * Returns whether transfer links can be created right now.
   *
   * @returns True while connected to a relay that announced `transfer`.
   */
  transferAvailable(): boolean {
    return this.client !== null && this.client.isOpen() && this.client.caps.has('transfer');
  }

  /**
   * Shares a file as a transfer link of this connection, in or outside a room.
   *
   * @param file File bytes.
   * @param name File name.
   * @returns Link, sanitized name, size and type.
   */
  async transferShare(file: Blob, name: string): Promise<HostCollaborationTransferShared> {
    const client = this.clientGet();
    if (!client.caps.has('transfer'))
      throw new SocketCollaborationError('transfer_unavailable', { t: 'error', code: 'transfer_unavailable' });
    if (this.transfer?.client !== client) this.transfer = { client, host: new HostCollaborationTransfer(client) };
    return this.transfer.host.share(file, name);
  }

  /**
   * Returns the download URL of a transfer link on the configured relay.
   *
   * @param link Link id.
   * @returns URL.
   */
  transferUrl(link: string): string {
    return hostCollaborationTransferUrl(this.options.url(), link);
  }

  /**
   * Returns the limits of the current connection, or the defaults.
   *
   * @returns Limits.
   */
  limits(): SocketCollaborationLimits {
    return this.client?.limits ?? SOCKET_COLLABORATION_LIMITS_DEFAULT;
  }

  /**
   * Hands a chat message to the UI while in a room.
   *
   * @param message Chat message.
   */
  private chatReceived(message: SocketCollaborationMessage): void {
    if (this.session !== null) this.listener.chat?.(message);
  }

  /**
   * Hands a typing presence message to the UI while in a room.
   *
   * @param message Typing message.
   */
  private typingReceived(message: SocketCollaborationMessage): void {
    if (this.session !== null) this.listener.typing?.(message);
  }

  /**
   * Sends a typing presence signal when the relay negotiated `typing`.
   *
   * @param stop True to clear the local typing flag.
   */
  typingSend(stop: boolean): void {
    const client = this.client;
    if (client === null || !client.isOpen() || !client.caps.has('typing')) return;
    if (this.session === null) return;
    client.send(stop ? { t: 'typing', stop: true } : { t: 'typing' });
  }

  /**
   * Resolves typing user ids to display names; unknown ids are skipped.
   *
   * @param users Typing user ids.
   * @returns Resolved names.
   */
  typingNames(users: readonly number[]): string[] {
    const roster = this.session?.roster;
    if (roster === undefined) return [];
    const names: string[] = [];
    for (const user of users) {
      const member = roster.get(user);
      if (member === undefined) continue;
      names.push(member.name);
    }
    return names;
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
    this.status('');
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
 * Builds the optional displayName field of room.create and room.join. Relays
 * that predate names and presence (no presence rate in the welcome) reject the
 * field; they still get the name from hello.
 *
 * @param name Stored display name.
 * @param limits Relay limits from the welcome.
 * @returns Field object, empty when the name is blank or the relay is older.
 */
export function runtimeCollaborationDisplayName(
  name: string,
  limits: Pick<SocketCollaborationLimits, 'presencePerSecond'>,
): { displayName?: string } {
  const normalized = displayNameNormalize(name);
  return normalized.ok && limits.presencePerSecond > 0 ? { displayName: normalized.name } : {};
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
