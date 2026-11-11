import { ButtonCollaborationChat } from '@/collaboration/chat/button_collaboration_chat.js';
import { composerCollaborationChatStateIdle } from '@/collaboration/chat/composer_collaboration_chat.js';
import { CooldownCollaborationChat } from '@/collaboration/chat/cooldown_collaboration_chat.js';
import {
  type EntryCollaborationChat,
  entryCollaborationChatParse,
  entryCollaborationChatPresence,
} from '@/collaboration/chat/entry_collaboration_chat.js';
import { PanelCollaborationChat } from '@/collaboration/chat/panel_collaboration_chat.js';
import { ToastCollaborationChat } from '@/collaboration/chat/toast_collaboration_chat.js';
import {
  TypingCollaborationChatSignal,
  typingCollaborationChatCaption,
} from '@/collaboration/chat/typing_collaboration_chat.js';
import {
  SocketCollaborationError,
  type SocketCollaborationLimits,
  type SocketCollaborationMessage,
} from '@/collaboration/net/socket_collaboration_types.js';

/** How often old messages are removed. */
export const CONTROLLER_COLLABORATION_CHAT_EXPIRE_EVERY_MS = 30 * 1000;
/** Most joined and left lines shown per minute; further ones are skipped. */
export const CONTROLLER_COLLABORATION_CHAT_PRESENCE_PER_MINUTE = 20;
/** Window of the joined and left line limit. */
const CONTROLLER_COLLABORATION_CHAT_PRESENCE_WINDOW_MS = 60 * 1000;
/** How often the Send countdown is redrawn. */
const CONTROLLER_COLLABORATION_CHAT_TICK_MS = 250;

/** Relay services the chat uses. */
export interface ControllerCollaborationChatLink {
  /**
   * Sends a chat message.
   *
   * @param text Raw text.
   * @returns The relay's `chat.sent` reply; rejects with
   *   SocketCollaborationError.
   */
  chatSend(text: string): Promise<SocketCollaborationMessage>;
  /**
   * Shares a file as a transfer link in a chat message.
   *
   * @param file Picked file.
   * @returns The relay's `chat.sent` reply; rejects with
   *   SocketCollaborationError.
   */
  chatShare(file: File): Promise<SocketCollaborationMessage>;
  /**
   * Returns the download URL of a transfer link.
   *
   * @param link Link id.
   * @returns URL.
   */
  transferUrl(link: string): string;
  /**
   * Returns the relay limits of the current connection.
   *
   * @returns Limits.
   */
  limits(): SocketCollaborationLimits;
  /**
   * Sends a typing presence signal when the relay negotiated `typing`.
   *
   * @param stop True to clear the local typing flag on the relay.
   */
  typingSend(stop: boolean): void;
  /**
   * Resolves typing user ids to display names; unknown ids are skipped.
   *
   * @param users Typing user ids from the relay.
   * @returns Resolved names in the same order.
   */
  typingNames(users: readonly number[]): string[];
}

/** Where the chat puts its window and button. */
export interface ControllerCollaborationChatHost {
  /** Parent of the chat window. */
  container: HTMLElement;
  /**
   * Returns the status bar root, if any.
   *
   * @returns Status bar or null.
   */
  statusBarElement(): HTMLElement | null;
}

/**
 * Explains why the relay refused a chat message.
 *
 * @param error Error from chatSend.
 * @returns Text shown above the message field.
 */
export function controllerCollaborationChatErrorText(error: unknown): string {
  if (!(error instanceof SocketCollaborationError)) return 'The message could not be sent. Check your connection.';
  const reason = error.details['reason'];
  if (error.code === 'chat_rate_limited') return 'Slow down: one message every few seconds.';
  if (error.code === 'not_in_room') return 'You are not in a room.';
  if (error.code === 'invalid_chat' && reason === 'too_long') return 'That message is too long.';
  if (error.code === 'invalid_chat' && reason === 'too_many_lines') return 'That message has too many lines.';
  if (error.code === 'invalid_chat') return 'That message is empty after removing invisible characters.';
  if (error.code === 'transfer_unavailable') return 'This server cannot share files.';
  if (error.code === 'transfer_rate_limited') return 'Slow down: one file every few seconds.';
  return `The server refused the message (${error.code}).`;
}

/**
 * Room chat: the window, the status bar button with unread count, the
 * notification and the client side of the send interval.
 */
export class ControllerCollaborationChat {
  readonly panel: PanelCollaborationChat;
  readonly toast: ToastCollaborationChat;
  readonly cooldown: CooldownCollaborationChat;
  private readonly host: ControllerCollaborationChatHost;
  private readonly link: ControllerCollaborationChatLink;
  private readonly clock: () => number;
  private button: ButtonCollaborationChat | null;
  private room: string | null;
  private readonly unreadIds: Set<number>;
  private tickTimer: ReturnType<typeof setTimeout> | null;
  private expireTimer: ReturnType<typeof setInterval> | null;
  private readonly typing: TypingCollaborationChatSignal;
  private readonly presenceTimes: number[];

  /**
   * Creates the chat with its hidden window.
   *
   * @param host Editor surfaces.
   * @param link Relay services.
   * @param clock Returns the current time (epoch ms).
   */
  constructor(
    host: ControllerCollaborationChatHost,
    link: ControllerCollaborationChatLink,
    clock: () => number = Date.now,
  ) {
    this.host = host;
    this.link = link;
    this.clock = clock;
    this.button = null;
    this.room = null;
    this.unreadIds = new Set();
    this.presenceTimes = [];
    this.tickTimer = null;
    this.expireTimer = null;
    this.cooldown = new CooldownCollaborationChat(0);
    this.toast = new ToastCollaborationChat(() => this.open());
    this.typing = new TypingCollaborationChatSignal((stop) => this.link.typingSend(stop), clock);
    const handlers = {
      send: (text: string) => void this.send(text),
      file: (file: File) => void this.share(file),
      shown: () => this.shown(),
      hidden: () => this.refresh(),
    };
    this.panel = new PanelCollaborationChat(
      host.container,
      handlers,
      null,
      clock,
      () => Math.max(0, host.statusBarElement()?.offsetHeight ?? 0),
      () => this.typing.typed(),
    );
    this.refresh();
  }

  /**
   * Returns the number of messages that arrived while the window was closed.
   *
   * @returns Unread count.
   */
  unreadCount(): number {
    return this.unreadIds.size;
  }

  /**
   * Starts the chat of a room; earlier messages are gone.
   *
   * @param room Room name.
   */
  roomEntered(room: string): void {
    this.roomReset();
    this.room = room;
    this.cooldown.intervalSet(this.link.limits().chatIntervalMs);
    this.expireTimer = setInterval(() => this.expireTick(), CONTROLLER_COLLABORATION_CHAT_EXPIRE_EVERY_MS);
    this.refresh();
  }

  /**
   * Ends the chat of the room: messages, unread count and notifications go
   * away.
   */
  roomLeft(): void {
    if (this.room === null) return;
    this.roomReset();
    this.refresh();
  }

  /**
   * Shows a message from another member.
   *
   * @param message Untrusted `chat` message.
   */
  received(message: SocketCollaborationMessage): void {
    const entry = this.room === null ? null : this.entryParse(message);
    if (entry === null || !this.panel.list.add(entry)) return;
    if (!this.panel.isOpen()) this.unreadIds.add(entry.id);
    this.unreadIdsReconcile();
    if (this.panel.isOpen()) return;
    this.toast.notify(entry);
    this.refresh();
  }

  /**
   * Shows a gray line saying a member joined or left. It is no message: it
   * never counts as unread, never notifies and never counts toward the new
   * messages pill. Beyond a few lines a minute, further ones are skipped.
   *
   * @param user Relay user id of the member.
   * @param name Display name of the member.
   * @param color Color slot of the member.
   * @param joined True for joined, false for left.
   */
  presenceReceived(user: number, name: string, color: number, joined: boolean): void {
    if (this.room === null || !this.presenceAllowed()) return;
    const after = this.panel.list.newestId();
    this.panel.list.add(entryCollaborationChatPresence(after, user, name, color, joined, this.clock()));
  }

  /** Opens the window. */
  open(): void {
    this.panel.show();
  }

  /** Opens or closes the window. */
  toggle(): void {
    this.panel.toggle();
  }

  /**
   * Sends the text when the interval allows it.
   *
   * @param text Raw text.
   */
  async send(text: string): Promise<void> {
    await this.submit(() => this.link.chatSend(text), true);
  }

  /**
   * Shares a file as a chat message when the interval allows it.
   *
   * @param file Picked file.
   */
  async share(file: File): Promise<void> {
    await this.submit(() => this.link.chatShare(file), false);
  }

  /**
   * Applies a typing presence broadcast from the relay.
   *
   * @param message Untrusted `typing` message.
   */
  typingReceived(message: SocketCollaborationMessage): void {
    if (this.room === null || message.t !== 'typing') return;
    const users = message['users'];
    if (!Array.isArray(users)) return;
    const ids = users.filter((user): user is number => typeof user === 'number' && Number.isInteger(user));
    this.panel.statusSet(typingCollaborationChatCaption(this.link.typingNames(ids)));
  }

  /** Removes the window, button and timers. */
  dispose(): void {
    this.roomReset();
    this.panel.dispose();
    this.button?.dispose();
    this.button = null;
  }

  /**
   * Sends one message when the interval allows it.
   *
   * @param request Sends the message and returns the relay's reply.
   * @param clear True to empty the message field once accepted.
   */
  private async submit(request: () => Promise<SocketCollaborationMessage>, clear: boolean): Promise<void> {
    if (this.room === null || !this.cooldown.ready(this.clock())) return;
    this.cooldown.started();
    this.panel.composer.noticeSet('');
    this.refresh();
    try {
      this.accepted(await request(), clear);
    } catch (error) {
      this.refused(error);
    }
    this.refresh();
  }

  /**
   * Reads a chat message and adds the download URL of its file.
   *
   * @param message Untrusted message.
   * @returns Entry, or null when malformed.
   */
  private entryParse(message: SocketCollaborationMessage): EntryCollaborationChat | null {
    const entry = entryCollaborationChatParse(message);
    if (entry?.file !== undefined) entry.file.url = this.link.transferUrl(entry.file.link);
    return entry;
  }

  /**
   * Shows the own message once the relay accepted it.
   *
   * @param reply `chat.sent` reply.
   * @param clear True to empty the message field.
   */
  private accepted(reply: SocketCollaborationMessage, clear: boolean): void {
    this.cooldown.accepted(this.clock());
    if (clear) {
      this.typing.stop();
      this.panel.composer.clear();
    }
    const entry = this.entryParse(reply);
    if (entry !== null && this.room !== null) this.panel.list.add(entry, true);
  }

  /**
   * Keeps the text and explains a refused message; a rate limit waits for the
   * time the relay reported.
   *
   * @param error Error from chatSend.
   */
  private refused(error: unknown): void {
    const limited = error instanceof SocketCollaborationError && error.code === 'chat_rate_limited';
    if (limited) this.cooldown.limited(this.clock(), error.details['retryAfterMs']);
    else this.cooldown.failed();
    this.panel.composer.noticeSet(controllerCollaborationChatErrorText(error));
  }

  /**
   * Takes one joined or left line from the per-minute allowance.
   *
   * @returns True when the line may be shown.
   */
  private presenceAllowed(): boolean {
    const now = this.clock();
    const windowStart = now - CONTROLLER_COLLABORATION_CHAT_PRESENCE_WINDOW_MS;
    while ((this.presenceTimes[0] ?? now) <= windowStart) this.presenceTimes.shift();
    if (this.presenceTimes.length >= CONTROLLER_COLLABORATION_CHAT_PRESENCE_PER_MINUTE) return false;
    this.presenceTimes.push(now);
    return true;
  }

  /** Clears the unread count when the window opens. */
  private shown(): void {
    this.unreadIds.clear();
    this.toast.dismiss();
    this.refresh();
  }

  /** Forgets the room's messages and stops the timers. */
  private roomReset(): void {
    this.room = null;
    this.unreadIds.clear();
    this.presenceTimes.length = 0;
    this.cooldown.reset();
    this.typing.stop(false);
    this.panel.statusSet('');
    this.toast.dismiss();
    this.panel.list.clear();
    this.panel.composer.noticeSet('');
    if (this.expireTimer !== null) clearInterval(this.expireTimer);
    this.expireTimer = null;
    this.tickStop();
  }

  /**
   * Removes expired messages and refreshes the unread badge when the log
   * shrinks.
   */
  private expireTick(): void {
    if (this.panel.list.expire() === 0) return;
    this.unreadIdsReconcile();
    this.refresh();
  }

  /** Drops unread ids that are no longer present in the message log. */
  private unreadIdsReconcile(): void {
    const present = new Set(this.panel.list.entries().map((entry) => entry.id));
    for (const id of [...this.unreadIds]) {
      if (!present.has(id)) this.unreadIds.delete(id);
    }
  }

  /** Redraws the composer, title and button, and keeps the countdown running. */
  private refresh(): void {
    const limits = this.link.limits();
    const remainingMs = this.cooldown.remaining(this.clock());
    const supported = limits.chatIntervalMs > 0;
    this.panel.titleSet(this.room ?? '');
    this.panel.composer.stateSet({
      ...composerCollaborationChatStateIdle(),
      enabled: this.room !== null && supported,
      remainingMs,
      sending: this.cooldown.sending(),
      lengthMaximum: limits.chatTextLength,
      linesMaximum: limits.chatTextLines,
      placeholder: this.placeholder(supported),
    });
    this.buttonUpdate();
    this.tickSchedule(remainingMs);
  }

  /**
   * Returns the message field placeholder.
   *
   * @param supported True when the relay has chat.
   * @returns Placeholder.
   */
  private placeholder(supported: boolean): string {
    if (this.room === null) return 'Join a room to chat';
    if (!supported) return 'This server has no chat';
    return `Message ${this.room}`;
  }

  /** Creates the status bar button on first use and shows the unread count. */
  private buttonUpdate(): void {
    const statusBar = this.host.statusBarElement();
    if (this.button === null && statusBar !== null)
      this.button = new ButtonCollaborationChat(statusBar, () => this.toggle());
    this.button?.visibleSet(this.room !== null);
    this.button?.unreadSet(this.unreadCount());
  }

  /**
   * Redraws again while the countdown runs.
   *
   * @param remainingMs Time until the next message may be sent.
   */
  private tickSchedule(remainingMs: number): void {
    this.tickStop();
    if (remainingMs <= 0 || this.cooldown.sending()) return;
    this.tickTimer = setTimeout(() => this.refresh(), Math.min(remainingMs, CONTROLLER_COLLABORATION_CHAT_TICK_MS));
  }

  /** Stops the countdown redraw. */
  private tickStop(): void {
    if (this.tickTimer !== null) clearTimeout(this.tickTimer);
    this.tickTimer = null;
  }
}
