import { DISCORD_APPLICATION_ID } from './discord_application_id.js';
import { discordIpcFrameEncode, DiscordIpcFrameReader } from './discord_ipc_frame.js';
import {
  DISCORD_IPC_OPCODE_CLOSE,
  DISCORD_IPC_OPCODE_FRAME,
  DISCORD_IPC_OPCODE_HANDSHAKE,
  DISCORD_IPC_OPCODE_PING,
  DISCORD_IPC_OPCODE_PONG,
} from './discord_ipc_opcode.js';
import { DISCORD_IPC_HANDSHAKE_TIMEOUT_MS } from './discord_rich_presence_constants.js';
import type { DiscordActivity } from './discord_rich_presence_activity.js';
import type { DiscordRichPresenceClock } from './discord_rich_presence_clock.js';
import type {
  DiscordIpcTransport,
  DiscordIpcTransportConnect,
  DiscordIpcTransportHandlers,
} from './discord_ipc_transport.js';

/** Options used to construct a Discord IPC client. */
export interface DiscordIpcClientOptions {
  applicationId?: string;
  connect: DiscordIpcTransportConnect;
  clock: DiscordRichPresenceClock;
  handshakeTimeoutMs?: number;
  onDisconnect?: () => void;
}

/** Local Discord IPC client: handshake, frames, ping or pong, and activity. */
export class DiscordIpcClient {
  private readonly applicationId: string;
  private readonly connectTransport: DiscordIpcTransportConnect;
  private readonly clock: DiscordRichPresenceClock;
  private readonly handshakeTimeoutMs: number;
  private readonly onDisconnect: (() => void) | null;
  private readonly reader = new DiscordIpcFrameReader();
  private transport: DiscordIpcTransport | null;
  private ready: boolean;
  private nonce: number;
  private handshakeResolve: ((ready: boolean) => void) | null;
  private handshakeTimer: unknown | null;
  private closed: boolean;

  /**
   * Creates a disconnected client.
   *
   * @param options Transport, clock, and optional application id.
   */
  constructor(options: DiscordIpcClientOptions) {
    this.applicationId = options.applicationId ?? DISCORD_APPLICATION_ID;
    this.connectTransport = options.connect;
    this.clock = options.clock;
    this.handshakeTimeoutMs = options.handshakeTimeoutMs ?? DISCORD_IPC_HANDSHAKE_TIMEOUT_MS;
    this.onDisconnect = options.onDisconnect ?? null;
    this.transport = null;
    this.ready = false;
    this.nonce = 0;
    this.handshakeResolve = null;
    this.handshakeTimer = null;
    this.closed = false;
  }

  /**
   * Returns whether the handshake completed on the current socket.
   *
   * @returns True when SET_ACTIVITY may be sent.
   */
  isReady(): boolean {
    return this.ready && this.transport !== null;
  }

  /**
   * Tries each socket path until a handshake succeeds.
   *
   * @param paths Candidate pipe or socket paths.
   * @returns True when connected and ready.
   */
  async connect(paths: readonly string[]): Promise<boolean> {
    this.closed = false;
    for (const path of paths) {
      if (this.closed) return false;
      if (await this.connectPath(path)) return true;
    }
    return false;
  }

  /**
   * Sends SET_ACTIVITY with an activity, or clears it when the activity is
   * null.
   *
   * @param activity Activity to show, or null to clear.
   * @param pid Desktop process id.
   */
  setActivity(activity: DiscordActivity | null, pid: number): void {
    if (!this.isReady()) return;
    this.writeFrame(DISCORD_IPC_OPCODE_FRAME, {
      cmd: 'SET_ACTIVITY',
      args: { pid, activity },
      nonce: this.nextNonce(),
    });
  }

  /** Closes the socket and forgets handshake state. */
  disconnect(): void {
    this.closed = true;
    this.disconnectSocket();
  }

  /**
   * Connects to one path and completes the handshake.
   *
   * @param path Candidate pipe or socket path.
   * @returns True when the handshake succeeded.
   */
  private async connectPath(path: string): Promise<boolean> {
    const transport = await this.openTransport(path);
    if (transport === null) return false;
    this.transport = transport;
    const ready = await this.handshake();
    if (ready) return true;
    this.disconnectSocket();
    return false;
  }

  /**
   * Opens a transport and swallows connection failures.
   *
   * @param path Candidate pipe or socket path.
   * @returns Transport, or null when the path could not be opened.
   */
  private async openTransport(path: string): Promise<DiscordIpcTransport | null> {
    try {
      return await this.connectTransport(path, this.transportHandlers());
    } catch {
      return null;
    }
  }

  /**
   * Returns socket callbacks bound to this client.
   *
   * @returns Transport handlers.
   */
  private transportHandlers(): DiscordIpcTransportHandlers {
    return {
      onData: (chunk) => this.receive(chunk),
      onClose: () => this.handleTransportEnded(),
      onError: () => this.handleTransportEnded(),
    };
  }

  /**
   * Sends the handshake and waits for a READY event or a timeout.
   *
   * @returns True when READY arrived before the timeout.
   */
  private handshake(): Promise<boolean> {
    this.writeFrame(DISCORD_IPC_OPCODE_HANDSHAKE, { v: 1, client_id: this.applicationId });
    return new Promise((resolve) => {
      this.handshakeResolve = resolve;
      this.handshakeTimer = this.clock.setTimeout(() => this.finishHandshake(false), this.handshakeTimeoutMs);
    });
  }

  /**
   * Decodes incoming bytes and handles each complete frame.
   *
   * @param chunk Newly received bytes.
   */
  private receive(chunk: Uint8Array): void {
    for (const frame of this.reader.push(chunk)) this.handleFrame(frame.opcode, frame.payload);
  }

  /**
   * Handles one decoded IPC frame.
   *
   * @param opcode Frame opcode.
   * @param payload Parsed JSON body, or null when invalid.
   */
  private handleFrame(opcode: number, payload: unknown): void {
    if (opcode === DISCORD_IPC_OPCODE_PING) {
      this.writeFrame(DISCORD_IPC_OPCODE_PONG, payload ?? {});
      return;
    }
    if (opcode === DISCORD_IPC_OPCODE_CLOSE) {
      this.handleTransportEnded();
      return;
    }
    if (opcode === DISCORD_IPC_OPCODE_FRAME) this.handleDispatch(payload);
  }

  /**
   * Completes the handshake when a READY event arrives.
   *
   * @param payload Frame payload.
   */
  private handleDispatch(payload: unknown): void {
    if (this.ready || !discordIpcPayloadIsReady(payload)) return;
    this.ready = true;
    this.finishHandshake(true);
  }

  /**
   * Resolves an in-flight handshake and clears its timer.
   *
   * @param ready Whether READY arrived in time.
   */
  private finishHandshake(ready: boolean): void {
    const resolve = this.handshakeResolve;
    this.handshakeResolve = null;
    if (this.handshakeTimer !== null) this.clock.clearTimeout(this.handshakeTimer);
    this.handshakeTimer = null;
    resolve?.(ready);
  }

  /** Tears down a dropped socket and notifies the host when unexpected. */
  private handleTransportEnded(): void {
    const notify = this.ready && !this.closed;
    this.disconnectSocket();
    if (notify) this.onDisconnect?.();
  }

  /** Closes the current socket and resets handshake state. */
  private disconnectSocket(): void {
    const transport = this.transport;
    this.transport = null;
    this.ready = false;
    this.finishHandshake(false);
    transport?.close();
  }

  /**
   * Encodes and writes one IPC frame, ignoring write failures.
   *
   * @param opcode Frame opcode.
   * @param payload JSON-serializable body.
   */
  private writeFrame(opcode: number, payload: unknown): void {
    try {
      this.transport?.write(discordIpcFrameEncode(opcode, payload));
    } catch {
      return;
    }
  }

  /**
   * Returns a unique SET_ACTIVITY nonce.
   *
   * @returns Nonce string.
   */
  private nextNonce(): string {
    this.nonce += 1;
    return String(this.nonce);
  }
}

/**
 * Returns whether a frame payload is a READY dispatch.
 *
 * @param payload Frame payload.
 * @returns True when the event name is READY.
 */
export function discordIpcPayloadIsReady(payload: unknown): boolean {
  if (typeof payload !== 'object' || payload === null) return false;
  return (payload as { evt?: unknown }).evt === 'READY';
}
