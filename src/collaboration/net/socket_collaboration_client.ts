import { OutboxCollaborationCustom } from '@/collaboration/forks/outbox_collaboration_custom.js';
import { COLLABORATION_EDITOR_VERSION } from '@/collaboration/forks/identity_collaboration_editor.js';
import { OutboxCollaborationBucket } from '@/collaboration/net/outbox_collaboration_bucket.js';
import { SocketCollaborationClosedError } from '@/collaboration/net/socket_collaboration_closed_error.js';
import {
  SOCKET_COLLABORATION_LIMITS_DEFAULT,
  SocketCollaborationError,
  socketCollaborationLimitsParse,
  type SocketCollaborationFactory,
  type SocketCollaborationLike,
  type SocketCollaborationLimits,
  type SocketCollaborationListener,
  type SocketCollaborationMessage,
  type SocketCollaborationWelcome,
} from '@/collaboration/net/socket_collaboration_types.js';
import { PROTOCOL_ID, BINARY_FRAME_KIND_CUSTOM } from '@/collaboration/shared/protocol_definitions.js';
import {
  PROTOCOL_CAPABILITIES,
  PROTOCOL_VERSION_MAXIMUM,
  PROTOCOL_VERSION_MINIMUM,
} from '@/collaboration/shared/protocol_versioning.js';
import { displayNameFallback } from '@/collaboration/shared/room_name_policy.js';

/** Interval of keep-alive pings, well below the relay idle timeout. */
export const SOCKET_COLLABORATION_KEEPALIVE_MS = 20000;
/** Default timeout of request/reply exchanges. */
export const SOCKET_COLLABORATION_REQUEST_TIMEOUT_MS = 20000;
/**
 * Socket send buffer above which queued frames wait, so a bulk stream (large
 * textures to a joiner) never backs up the socket and presence can interleave.
 */
export const SOCKET_COLLABORATION_QUEUE_BUFFERED_MAXIMUM = 256 * 1024;
/** Largest stream chunk this client sends (below the relay maximum). */
export const SOCKET_COLLABORATION_STREAM_CHUNK_BYTES = 64 * 1024;
/**
 * Socket send buffer above which presence frames are skipped: what the queue
 * may leave in flight (its limit plus one chunk) and some room.
 */
export const SOCKET_COLLABORATION_PRESENCE_BUFFERED_MAXIMUM =
  SOCKET_COLLABORATION_QUEUE_BUFFERED_MAXIMUM + 2 * SOCKET_COLLABORATION_STREAM_CHUNK_BYTES;
/** Poll interval while queued frames wait for the socket buffer to drain. */
const SOCKET_COLLABORATION_DRAIN_POLL_MS = 8;
/**
 * Fraction of the relay message rate the client allows itself for queued
 * frames.
 */
const SOCKET_COLLABORATION_RATE_SHARE = 0.8;
/** Fraction of the relay message rate kept for presence and toy frames. */
const SOCKET_COLLABORATION_PRESENCE_RATE_SHARE = 0.15;

/** Pending request waiting for its reply. */
interface SocketCollaborationWaiter {
  resolve: (message: SocketCollaborationMessage) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout> | undefined;
}

/**
 * WebSocket client for the collaboration relay: performs the hello/welcome
 * handshake, correlates request ids with replies, paces outgoing frames below
 * the relay rate limits and keeps the connection alive.
 */
export class SocketCollaborationClient {
  private readonly factory: SocketCollaborationFactory;
  private readonly listener: SocketCollaborationListener;
  private readonly queue: (string | Uint8Array)[];
  private readonly waiters: Map<number, SocketCollaborationWaiter>;
  private socket: SocketCollaborationLike | null;
  private bucket: OutboxCollaborationBucket;
  private presenceBucket: OutboxCollaborationBucket;
  private requestNext: number;
  private readonly customOutbox = new OutboxCollaborationCustom(
    (frame) => this.sendNow(frame),
    () => this.queue.length === 0,
  );
  private flushTimer: ReturnType<typeof setTimeout> | null;
  private keepAliveTimer: ReturnType<typeof setInterval> | null;
  private welcomeWaiter: SocketCollaborationWaiter | null;
  private relayUrl: string;
  private socketOpened: boolean;
  limits: SocketCollaborationLimits;
  user: number;
  /** Optional capabilities agreed in the welcome. */
  caps: ReadonlySet<string>;

  /**
   * Creates a disconnected client.
   *
   * @param factory Socket factory.
   * @param listener Receives unsolicited messages and the close event.
   */
  constructor(factory: SocketCollaborationFactory, listener: SocketCollaborationListener) {
    this.factory = factory;
    this.listener = listener;
    this.queue = [];
    this.waiters = new Map();
    this.socket = null;
    this.limits = SOCKET_COLLABORATION_LIMITS_DEFAULT;
    this.bucket = socketCollaborationBucket(this.limits);
    this.presenceBucket = socketCollaborationPresenceBucket(this.limits);
    this.requestNext = 1;
    this.flushTimer = null;
    this.keepAliveTimer = null;
    this.welcomeWaiter = null;
    this.relayUrl = '';
    this.socketOpened = false;
    this.user = 0;
    this.caps = new Set();
  }

  /**
   * Opens the socket and completes the handshake.
   *
   * @param url Relay WebSocket URL.
   * @param name Display name.
   * @returns Welcome identity and limits.
   */
  connect(url: string, name: string): Promise<SocketCollaborationWelcome> {
    return new Promise<SocketCollaborationMessage>((resolve, reject) => {
      this.welcomeWaiter = { resolve, reject, timer: setTimeout(() => reject(new Error('timeout')), 10000) };
      const socket = this.factory(url);
      socket.binaryType = 'arraybuffer';
      this.socket = socket;
      this.relayUrl = url;
      this.socketOpened = false;
      socket.onopen = () => this.opened(name);
      socket.onmessage = (event) => {
        this.receive(event.data);
        this.flushKick();
      };
      socket.onclose = (event) => this.closed(event.code, event.reason);
      socket.onerror = () => undefined;
    }).then((welcome) => this.welcomeApply(welcome));
  }

  /**
   * Handles the socket opening by sending the hello message.
   *
   * @param name Display name.
   */
  private opened(name: string): void {
    this.socketOpened = true;
    this.sendNow(JSON.stringify(socketCollaborationHello(name)));
  }

  /**
   * Returns whether the socket is open.
   *
   * @returns True when connected.
   */
  isOpen(): boolean {
    return this.socket !== null && this.socket.readyState === 1;
  }

  /**
   * Queues a JSON message.
   *
   * @param message Message object.
   */
  send(message: object): void {
    this.enqueue(JSON.stringify(message));
  }

  /**
   * Queues a binary frame.
   *
   * @param frame Frame bytes.
   */
  sendBinary(frame: Uint8Array): void {
    if (frame[1] === BINARY_FRAME_KIND_CUSTOM) this.customOutbox.enqueue(frame);
    else this.enqueue(frame);
  }

  /**
   * Sends a low-priority presence (or toy) frame right away: it never queues,
   * has its own small rate budget beside the queue's, and is dropped when the
   * socket is backed up or that budget is spent. Queued frames keep the socket
   * buffer small, so presence interleaves with a long bulk stream instead of
   * waiting for it.
   *
   * @param frame Presence frame.
   * @returns True when the frame was written to the socket.
   */
  sendPresence(frame: Uint8Array): boolean {
    const socket = this.socket;
    if (socket === null || socket.readyState !== 1) return false;
    if (socket.bufferedAmount > SOCKET_COLLABORATION_PRESENCE_BUFFERED_MAXIMUM) return false;
    if (!this.presenceBucket.take(frame.byteLength)) return false;
    socket.send(frame);
    return true;
  }

  /**
   * Sends a message with a fresh request id and waits for its reply.
   *
   * @param message Message without `r`.
   * @param timeoutMs Reply timeout.
   * @returns Reply message; rejects with SocketCollaborationError on relay
   *   errors.
   */
  request(
    message: object,
    timeoutMs: number = SOCKET_COLLABORATION_REQUEST_TIMEOUT_MS,
  ): Promise<SocketCollaborationMessage> {
    const r = this.requestIdNext();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.waiterSettle(r, null, new Error('timeout')), timeoutMs);
      this.waiters.set(r, { resolve, reject, timer });
      this.send({ ...message, r });
    });
  }

  /**
   * Sends custom binary data through its independently paced FIFO; edits have
   * priority.
   *
   * @param encode Builds the frame with its unique request id.
   * @returns Relay acknowledgement or explicit error.
   */
  requestBinary(encode: (r: number) => Uint8Array): Promise<SocketCollaborationMessage> {
    const r = this.requestIdNext();
    return new Promise((resolve, reject) => {
      const frame = encode(r);
      this.waiters.set(r, { resolve, reject, timer: undefined });
      try {
        this.customOutbox.enqueue(frame, () => {
          const waiter = this.waiters.get(r);
          if (waiter)
            waiter.timer = setTimeout(
              () => this.waiterSettle(r, null, new Error('timeout')),
              SOCKET_COLLABORATION_REQUEST_TIMEOUT_MS,
            );
        });
      } catch (error) {
        this.waiterSettle(r, null, error instanceof Error ? error : new Error('Custom queue failed'));
      }
    });
  }

  /**
   * Allocates a free u32 correlation id shared by binary and JSON requests.
   *
   * @returns Id not currently awaiting a response.
   */
  private requestIdNext(): number {
    let r: number;
    do {
      r = this.requestNext;
      this.requestNext = r >= 0xffffffff ? 1 : r + 1;
    } while (this.waiters.has(r));
    return r;
  }

  /** Closes the connection without reporting it to the listener. */
  close(): void {
    const socket = this.socket;
    this.socket = null;
    this.timersStop();
    this.queue.length = 0;
    this.customOutbox.clear();
    this.waitersFail(new Error('closed'));
    if (socket === null) return;
    socket.onclose = null;
    socket.onmessage = null;
    socket.close(1000, 'leave');
  }

  /**
   * Applies the welcome message and starts the keep-alive timer.
   *
   * @param welcome Welcome message.
   * @returns Identity and limits.
   */
  private welcomeApply(welcome: SocketCollaborationMessage): SocketCollaborationWelcome {
    this.limits = socketCollaborationLimitsParse(welcome['limits']);
    this.bucket = socketCollaborationBucket(this.limits);
    this.presenceBucket = socketCollaborationPresenceBucket(this.limits);
    this.user = typeof welcome['user'] === 'number' ? welcome['user'] : 0;
    this.keepAliveTimer = setInterval(() => this.send({ t: 'ping' }), SOCKET_COLLABORATION_KEEPALIVE_MS);
    const name = typeof welcome['name'] === 'string' ? welcome['name'] : displayNameFallback(this.user);
    const version = typeof welcome['version'] === 'number' ? welcome['version'] : PROTOCOL_VERSION_MINIMUM;
    const caps = Array.isArray(welcome['caps']) ? welcome['caps'].filter((cap) => typeof cap === 'string') : [];
    this.caps = new Set(caps);
    const online = typeof welcome['online'] === 'number' ? { online: welcome['online'] } : {};
    return { user: this.user, name, limits: this.limits, version, caps, ...online };
  }

  /**
   * Routes one inbound frame.
   *
   * @param data Frame data.
   */
  private receive(data: unknown): void {
    if (data instanceof ArrayBuffer) return this.listener.binary(new Uint8Array(data));
    if (ArrayBuffer.isView(data))
      return this.listener.binary(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
    if (typeof data !== 'string') return;
    const message = socketCollaborationParse(data);
    if (message === null) return;
    if (message.t === 'welcome' && this.welcomeWaiter !== null) return this.welcomeSettle(message, null);
    if (message.t === 'error' && message.r === undefined && this.welcomeWaiter !== null) {
      return this.welcomeSettle(null, new SocketCollaborationError(String(message['code']), message));
    }
    if (message.r !== undefined && this.waiters.has(message.r)) return this.replySettle(message);
    this.listener.message(message);
  }

  /**
   * Settles a request from its reply.
   *
   * @param message Reply message carrying `r`.
   */
  private replySettle(message: SocketCollaborationMessage): void {
    const error = message.t === 'error' ? new SocketCollaborationError(String(message['code']), message) : null;
    this.waiterSettle(message.r ?? 0, error === null ? message : null, error);
  }

  /**
   * Settles the handshake.
   *
   * @param message Welcome message, or null on failure.
   * @param error Failure, or null.
   */
  private welcomeSettle(message: SocketCollaborationMessage | null, error: Error | null): void {
    const waiter = this.welcomeWaiter;
    this.welcomeWaiter = null;
    if (waiter === null) return;
    clearTimeout(waiter.timer);
    if (message !== null) waiter.resolve(message);
    else waiter.reject(error ?? new Error('closed'));
  }

  /**
   * Resolves or rejects one waiter.
   *
   * @param r Request id.
   * @param message Reply, or null.
   * @param error Failure, or null.
   */
  private waiterSettle(r: number, message: SocketCollaborationMessage | null, error: Error | null): void {
    const waiter = this.waiters.get(r);
    if (waiter === undefined) return;
    this.waiters.delete(r);
    clearTimeout(waiter.timer);
    if (message !== null) waiter.resolve(message);
    else waiter.reject(error ?? new Error('closed'));
  }

  /**
   * Rejects every outstanding request.
   *
   * @param error Failure to report.
   */
  private waitersFail(error: Error): void {
    [...this.waiters.keys()].forEach((r) => this.waiterSettle(r, null, error));
    this.welcomeSettle(null, error);
  }

  /**
   * Handles the socket closing.
   *
   * @param code Close code.
   * @param reason Close reason.
   */
  private closed(code: number, reason: string): void {
    if (this.socket === null) return;
    this.socket = null;
    this.timersStop();
    this.queue.length = 0;
    this.customOutbox.clear();
    this.waitersFail(new SocketCollaborationClosedError(code, reason, this.relayUrl, this.socketOpened));
    this.listener.closed(code, reason);
  }

  /**
   * Adds a frame to the paced queue.
   *
   * @param frame Text or binary frame.
   */
  private enqueue(frame: string | Uint8Array): void {
    if (this.socket === null) return;
    this.queue.push(frame);
    if (this.flushTimer === null) this.flush();
  }

  /**
   * Sends queued frames while the rate budget allows it and the socket buffer
   * stays small.
   */
  private flush(): void {
    this.flushTimer = null;
    while (this.queue.length > 0 && this.socket !== null) {
      if (this.socket.bufferedAmount > SOCKET_COLLABORATION_QUEUE_BUFFERED_MAXIMUM) {
        this.flushTimer = setTimeout(() => this.flush(), SOCKET_COLLABORATION_DRAIN_POLL_MS);
        return;
      }
      const next = this.queue[0] ?? '';
      const size = typeof next === 'string' ? next.length : next.byteLength;
      if (!this.bucket.take(size)) {
        this.flushTimer = setTimeout(() => this.flush(), this.bucket.waitMs(size));
        return;
      }
      this.queue.shift();
      this.sendNow(next);
    }
  }

  /**
   * Writes a frame to the socket immediately.
   *
   * @param frame Text or binary frame.
   */
  private sendNow(frame: string | Uint8Array): void {
    if (this.socket !== null && this.socket.readyState === 1) this.socket.send(frame);
  }

  /**
   * Flushes the queue when a frame arrives: relay replies and stream credits
   * clock a long transfer even where timers are throttled (background tabs).
   */
  private flushKick(): void {
    if (this.queue.length === 0 || this.socket === null) return;
    if (this.flushTimer !== null) clearTimeout(this.flushTimer);
    this.flush();
  }

  /** Stops the flush and keep-alive timers. */
  private timersStop(): void {
    if (this.flushTimer !== null) clearTimeout(this.flushTimer);
    if (this.keepAliveTimer !== null) clearInterval(this.keepAliveTimer);
    this.flushTimer = null;
    this.keepAliveTimer = null;
  }
}

/** Editor build sent in the hello; rooms record it and the room list shows it. */
export const SOCKET_COLLABORATION_EDITOR_BUILD = `aiworlded-editor/${COLLABORATION_EDITOR_VERSION}`;

/**
 * Builds the hello message: the protocol range this editor speaks, its optional
 * capabilities and its build. An empty display name is left out so the relay
 * assigns one instead of rejecting the handshake.
 *
 * @param name Display name.
 * @returns Hello message.
 */
export function socketCollaborationHello(name: string): object {
  const hello = {
    t: 'hello',
    protocol: PROTOCOL_ID,
    version: PROTOCOL_VERSION_MAXIMUM,
    minVersion: PROTOCOL_VERSION_MINIMUM,
    caps: [...PROTOCOL_CAPABILITIES],
    client: SOCKET_COLLABORATION_EDITOR_BUILD,
  };
  const trimmed = name.trim();
  return trimmed === '' ? hello : { ...hello, name: trimmed };
}

/**
 * Builds the pacing bucket for relay limits.
 *
 * @param limits Relay limits.
 * @returns Token bucket.
 */
function socketCollaborationBucket(limits: SocketCollaborationLimits): OutboxCollaborationBucket {
  const rate = limits.messagesPerSecond * SOCKET_COLLABORATION_RATE_SHARE;
  const byteRate = 12 * 1024 * 1024;
  return new OutboxCollaborationBucket(rate, rate * 2.5, byteRate, byteRate * 2, () => performance.now());
}

/**
 * Builds the rate budget of presence and toy frames: the share of the relay
 * message rate the queue leaves free.
 *
 * @param limits Relay limits.
 * @returns Bucket.
 */
function socketCollaborationPresenceBucket(limits: SocketCollaborationLimits): OutboxCollaborationBucket {
  const rate = limits.messagesPerSecond * SOCKET_COLLABORATION_PRESENCE_RATE_SHARE;
  const byteRate = 256 * 1024;
  return new OutboxCollaborationBucket(rate, rate * 2, byteRate, byteRate, () => performance.now());
}

/**
 * Parses a JSON relay message.
 *
 * @param text Frame text.
 * @returns Message, or null when malformed.
 */
export function socketCollaborationParse(text: string): SocketCollaborationMessage | null {
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== 'object' || value === null || typeof (value as { t?: unknown }).t !== 'string') return null;
    return value as SocketCollaborationMessage;
  } catch {
    return null;
  }
}
