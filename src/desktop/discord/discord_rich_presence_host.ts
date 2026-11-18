import { discordIpcBackoffDelay } from './discord_ipc_backoff.js';
import { DiscordIpcClient } from './discord_ipc_client.js';
import { discordIpcSocketPaths } from './discord_ipc_paths.js';
import type { DiscordIpcTransportConnect } from './discord_ipc_transport.js';
import { discordIpcTransportConnectNet } from './discord_ipc_transport_net.js';
import {
  discordRichPresenceActivityBuild,
  type DiscordRichPresenceEditorState,
} from './discord_rich_presence_activity.js';
import { discordRichPresenceClockSystem, type DiscordRichPresenceClock } from './discord_rich_presence_clock.js';
import { DISCORD_RICH_PRESENCE_THROTTLE_MS } from './discord_rich_presence_constants.js';
import { discordRichPresenceThrottleWaitMs } from './discord_rich_presence_throttle.js';

/** Options used to construct the Discord Rich Presence host. */
export interface DiscordRichPresenceHostOptions {
  applicationId?: string;
  pid?: number;
  connect?: DiscordIpcTransportConnect;
  paths?: () => string[];
  clock?: DiscordRichPresenceClock;
  throttleMs?: number;
}

/**
 * Bun-side host that connects to Discord and applies throttled activity
 * updates.
 */
export class DiscordRichPresenceHost {
  private readonly pid: number;
  private readonly paths: () => string[];
  private readonly clock: DiscordRichPresenceClock;
  private readonly throttleMs: number;
  private readonly client: DiscordIpcClient;
  private readonly sessionStart: number;
  private pending: DiscordRichPresenceEditorState | null;
  private lastSentAt: number | null;
  private throttleTimer: unknown | null;
  private reconnectTimer: unknown | null;
  private backoffAttempt: number;
  private connecting: boolean;
  private quitting: boolean;

  /**
   * Creates a disconnected host.
   *
   * @param options Process id, transport, paths, and clock overrides.
   */
  constructor(options: DiscordRichPresenceHostOptions = {}) {
    this.pid = options.pid ?? process.pid;
    this.paths = options.paths ?? (() => discordIpcSocketPaths(process.platform, process.env));
    this.clock = options.clock ?? discordRichPresenceClockSystem();
    this.throttleMs = options.throttleMs ?? DISCORD_RICH_PRESENCE_THROTTLE_MS;
    this.sessionStart = this.clock.now();
    this.pending = null;
    this.lastSentAt = null;
    this.throttleTimer = null;
    this.reconnectTimer = null;
    this.backoffAttempt = 0;
    this.connecting = false;
    this.quitting = false;
    this.client = this.createClient(options);
  }

  /**
   * Accepts an editor-state update from the webview.
   *
   * @param state Latest editor presence state.
   */
  update(state: DiscordRichPresenceEditorState): void {
    if (this.quitting) return;
    this.pending = state;
    if (!state.enabled) {
      this.clearPresence();
      return;
    }
    this.scheduleFlush();
  }

  /** Clears activity, closes the socket, and stops reconnecting. */
  quit(): void {
    if (this.quitting) return;
    this.quitting = true;
    this.clearTimers();
    this.clearPresence();
  }

  /**
   * Returns whether a socket handshake has completed.
   *
   * @returns True when activity can be written.
   */
  isReady(): boolean {
    return this.client.isReady();
  }

  /**
   * Creates the IPC client for this host.
   *
   * @param options Host construction options.
   * @returns Client using the host clock and transport.
   */
  private createClient(options: DiscordRichPresenceHostOptions): DiscordIpcClient {
    return new DiscordIpcClient({
      ...(options.applicationId === undefined ? {} : { applicationId: options.applicationId }),
      connect: options.connect ?? discordIpcTransportConnectNet,
      clock: this.clock,
      onDisconnect: () => this.handleDisconnect(),
    });
  }

  /** Sends or schedules the pending enabled activity. */
  private scheduleFlush(): void {
    this.clearThrottleTimer();
    const waitMs = discordRichPresenceThrottleWaitMs(this.lastSentAt, this.clock.now(), this.throttleMs);
    if (!this.client.isReady() || waitMs === 0) {
      this.flush();
      return;
    }
    this.throttleTimer = this.clock.setTimeout(() => this.flush(), waitMs);
  }

  /** Writes the pending activity, connecting first when needed. */
  private flush(): void {
    this.clearThrottleTimer();
    const state = this.pending;
    if (state === null || !state.enabled || this.quitting) return;
    if (!this.client.isReady()) {
      this.ensureConnected();
      return;
    }
    this.sendActivity(state);
  }

  /**
   * Writes SET_ACTIVITY for an enabled state.
   *
   * @param state Enabled editor presence state.
   */
  private sendActivity(state: DiscordRichPresenceEditorState): void {
    const activity = discordRichPresenceActivityBuild(state, this.sessionStart);
    if (activity === null) return;
    this.client.setActivity(activity, this.pid);
    this.lastSentAt = this.clock.now();
  }

  /** Clears Discord activity and disconnects without reconnecting. */
  private clearPresence(): void {
    this.clearReconnectTimer();
    if (this.client.isReady()) this.client.setActivity(null, this.pid);
    this.client.disconnect();
    this.lastSentAt = this.clock.now();
  }

  /** Starts a connection attempt when one is not already running. */
  private ensureConnected(): void {
    if (this.connecting || this.quitting || this.reconnectTimer !== null) return;
    void this.connectNow();
  }

  /** Attempts a connection and sends the pending activity when it succeeds. */
  private async connectNow(): Promise<void> {
    this.connecting = true;
    const connected = await this.client.connect(this.paths());
    this.connecting = false;
    this.handleConnectResult(connected);
  }

  /**
   * Sends pending activity after a successful connect, or schedules a retry.
   *
   * @param connected True when the handshake succeeded.
   */
  private handleConnectResult(connected: boolean): void {
    if (this.quitting) {
      this.client.disconnect();
      return;
    }
    if (!this.pending?.enabled) {
      this.client.disconnect();
      return;
    }
    if (connected) {
      this.backoffAttempt = 0;
      this.flush();
      return;
    }
    this.scheduleReconnect();
  }

  /** Schedules a reconnect after a dropped or failed connection. */
  private handleDisconnect(): void {
    if (this.quitting || this.pending?.enabled !== true) return;
    this.scheduleReconnect();
  }

  /** Starts a backoff timer for the next connection attempt. */
  private scheduleReconnect(): void {
    if (this.quitting || this.reconnectTimer !== null) return;
    const delay = discordIpcBackoffDelay(this.backoffAttempt);
    this.backoffAttempt += 1;
    this.reconnectTimer = this.clock.setTimeout(() => this.retryConnect(), delay);
  }

  /** Clears the reconnect timer and attempts a connection. */
  private retryConnect(): void {
    this.reconnectTimer = null;
    if (this.quitting || this.pending?.enabled !== true) return;
    this.ensureConnected();
  }

  /** Cancels throttle and reconnect timers. */
  private clearTimers(): void {
    this.clearThrottleTimer();
    this.clearReconnectTimer();
  }

  /** Cancels the pending throttle timer, if any. */
  private clearThrottleTimer(): void {
    if (this.throttleTimer === null) return;
    this.clock.clearTimeout(this.throttleTimer);
    this.throttleTimer = null;
  }

  /** Cancels the pending reconnect timer, if any. */
  private clearReconnectTimer(): void {
    if (this.reconnectTimer === null) return;
    this.clock.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }
}
