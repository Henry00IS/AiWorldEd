import type { DiscordRichPresenceEditorState } from './discord_rich_presence_activity.js';

export type { DiscordRichPresenceEditorState } from './discord_rich_presence_activity.js';

/** Bun-side requests for Discord Rich Presence updates. */
export type DiscordRichPresenceRequests = {
  discordRichPresenceUpdate: { params: DiscordRichPresenceEditorState; response: void };
};

/** RPC client surface the webview uses to reach the Bun host. */
export interface DiscordRichPresenceRpcClient {
  request: {
    discordRichPresenceUpdate: (params: DiscordRichPresenceEditorState) => Promise<void>;
  };
}

/** Webview-side bridge that forwards editor state to the Bun process. */
export interface DiscordRichPresenceBridge {
  /**
   * Sends the latest editor presence state to the Bun host.
   *
   * @param state Editor presence state.
   */
  update(state: DiscordRichPresenceEditorState): void;
}

declare global {
  interface Window {
    aiworldedDiscordPresence?: DiscordRichPresenceBridge;
  }
}

/**
 * Creates the webview bridge over the desktop RPC client.
 *
 * @param rpc RPC client connected to the Bun process.
 * @returns Presence bridge.
 */
export function createDiscordRichPresenceBridge(rpc: DiscordRichPresenceRpcClient): DiscordRichPresenceBridge {
  return {
    update: (state) => {
      void rpc.request.discordRichPresenceUpdate(state);
    },
  };
}

/**
 * Returns the desktop Discord Rich Presence bridge when running in the desktop
 * app.
 *
 * @returns Bridge, or null in a browser.
 */
export function discordRichPresenceBridge(): DiscordRichPresenceBridge | null {
  return typeof window === 'undefined' ? null : (window.aiworldedDiscordPresence ?? null);
}
