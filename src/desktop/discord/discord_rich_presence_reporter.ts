import { createDefaultDiscordSettings } from '@/settings/store/settings_defaults.js';
import type { DesktopPresenceSource } from '@/desktop/presence/desktop_presence_source.js';
import { desktopPresenceAttachRegister } from '@/desktop/presence/desktop_presence_source.js';
import type { DiscordRichPresenceEditorState } from './discord_rich_presence_activity.js';
import type { DiscordRichPresenceBridge } from './discord_rich_presence_protocol.js';

/** How often the reporter rereads editor state, in milliseconds. */
export const DISCORD_RICH_PRESENCE_REPORTER_INTERVAL_MS = 5_000;

/** Options used to start the webview Discord Rich Presence reporter. */
export interface DiscordRichPresenceReporterOptions {
  intervalMs?: number;
  setIntervalFn?: (callback: () => void, delayMs: number) => unknown;
  clearIntervalFn?: (handle: unknown) => void;
}

/** Sends editor presence snapshots to the Bun host while the desktop app runs. */
export class DiscordRichPresenceReporter {
  private readonly bridge: DiscordRichPresenceBridge;
  private readonly intervalMs: number;
  private readonly setIntervalFn: (callback: () => void, delayMs: number) => unknown;
  private readonly clearIntervalFn: (handle: unknown) => void;
  private source: DesktopPresenceSource | null;
  private unsubscribe: (() => void) | null;
  private timer: unknown | null;
  private lastPayload: string | null;

  /**
   * Creates a reporter that is idle until a presence source attaches.
   *
   * @param bridge Webview bridge to the Bun host.
   * @param options Polling interval and timer overrides.
   */
  constructor(bridge: DiscordRichPresenceBridge, options: DiscordRichPresenceReporterOptions = {}) {
    this.bridge = bridge;
    this.intervalMs = options.intervalMs ?? DISCORD_RICH_PRESENCE_REPORTER_INTERVAL_MS;
    this.setIntervalFn = options.setIntervalFn ?? ((callback, delayMs) => setInterval(callback, delayMs));
    this.clearIntervalFn =
      options.clearIntervalFn ?? ((handle) => clearInterval(handle as ReturnType<typeof setInterval>));
    this.source = null;
    this.unsubscribe = null;
    this.timer = null;
    this.lastPayload = null;
  }

  /** Starts listening for the editor presence source. */
  start(): void {
    desktopPresenceAttachRegister((source) => this.attach(source));
  }

  /** Stops polling and unregisters the presence listener. */
  stop(): void {
    desktopPresenceAttachRegister(null);
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.clearTimer();
    this.source = null;
  }

  /**
   * Attaches to an editor presence source and sends the first snapshot.
   *
   * @param source Editor presence source.
   */
  attach(source: DesktopPresenceSource): void {
    this.unsubscribe?.();
    this.source = source;
    this.unsubscribe = source.settingsStore()?.subscribe(() => this.publish()) ?? null;
    this.startTimer();
    this.publish();
  }

  /** Reads editor state and forwards it when it changed. */
  publish(): void {
    if (this.source === null) return;
    const state = discordRichPresenceEditorStateFrom(this.source);
    const payload = JSON.stringify(state);
    if (payload === this.lastPayload) return;
    this.lastPayload = payload;
    this.bridge.update(state);
  }

  /** Starts periodic publishing when a timer is not already running. */
  private startTimer(): void {
    if (this.timer !== null) return;
    this.timer = this.setIntervalFn(() => this.publish(), this.intervalMs);
  }

  /** Cancels the periodic publishing timer, if any. */
  private clearTimer(): void {
    if (this.timer === null) return;
    this.clearIntervalFn(this.timer);
    this.timer = null;
  }
}

/**
 * Builds the Discord editor state from a presence source.
 *
 * @param source Editor presence source.
 * @returns Editor presence state.
 */
export function discordRichPresenceEditorStateFrom(source: DesktopPresenceSource): DiscordRichPresenceEditorState {
  const snapshot = source.capture();
  const discord = source.settingsStore()?.getDiscordSettings() ?? createDefaultDiscordSettings();
  return {
    enabled: discord.richPresenceEnabled,
    hideProjectName: discord.hideProjectName,
    projectName: snapshot.projectName,
    levelName: snapshot.levelName,
    brushCount: snapshot.brushCount,
  };
}

/**
 * Starts a reporter that waits for the editor presence source and forwards
 * snapshots to the Bun host.
 *
 * @param bridge Webview bridge to the Bun host.
 * @param options Polling interval and timer overrides.
 * @returns Started reporter.
 */
export function discordRichPresenceReporterStart(
  bridge: DiscordRichPresenceBridge,
  options: DiscordRichPresenceReporterOptions = {},
): DiscordRichPresenceReporter {
  const reporter = new DiscordRichPresenceReporter(bridge, options);
  reporter.start();
  return reporter;
}
