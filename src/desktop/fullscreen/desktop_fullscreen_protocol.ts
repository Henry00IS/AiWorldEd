/** Bun-side requests behind the desktop fullscreen bridge. */
export type DesktopFullscreenRequests = {
  windowFullscreenToggle: { params: undefined; response: boolean };
};

/** RPC client surface the webview uses to reach the fullscreen handler. */
export interface DesktopFullscreenRpcClient {
  request: {
    windowFullscreenToggle: () => Promise<boolean>;
  };
}

/** Webview-side bridge to the desktop window's fullscreen state. */
export interface DesktopFullscreenBridge {
  /**
   * Switches the desktop window between fullscreen and its normal frame.
   *
   * @returns True when the window was asked to go fullscreen.
   */
  toggle(): Promise<boolean>;
}

/**
 * Creates the webview bridge over the desktop RPC client.
 *
 * @param rpc RPC client connected to the Bun process.
 * @returns Fullscreen bridge.
 */
export function createDesktopFullscreenBridge(rpc: DesktopFullscreenRpcClient): DesktopFullscreenBridge {
  return { toggle: () => rpc.request.windowFullscreenToggle() };
}
