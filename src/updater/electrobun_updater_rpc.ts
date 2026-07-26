import type { StandaloneUpdaterBridge } from './standalone_updater_bridge.js';
import { detectStandalonePlatform } from './standalone_updater_bridge.js';
import type { StandaloneHostUpdateCheck } from './update_types.js';

/** Request and response contract shared by the Electrobun Bun and webview sides. */
export interface ElectrobunUpdaterRpcSchema {
  bun: {
    requests: {
      checkForUpdate: { params: undefined; response: StandaloneHostUpdateCheck };
      installUpdate: { params: undefined; response: void };
      toggleFullscreen: { params: undefined; response: boolean };
    };
    messages: {};
  };
  webview: {
    requests: {};
    messages: {};
  };
}

/** Minimal RPC client surface needed by the renderer-side updater bridge. */
export interface ElectrobunUpdaterRpcClient {
  request: {
    checkForUpdate: () => Promise<StandaloneHostUpdateCheck>;
    installUpdate: () => Promise<void>;
    toggleFullscreen: () => Promise<boolean>;
  };
}

/**
 * Creates the renderer bridge backed by Electrobun's native updater RPC.
 *
 * @param rpc Typed RPC client connected to the Bun process.
 * @returns Standalone updater bridge for the renderer.
 */
export function createElectrobunUpdaterBridge(rpc: ElectrobunUpdaterRpcClient): StandaloneUpdaterBridge {
  return {
    kind: 'electrobun',
    platform: detectStandalonePlatform(),
    checkForUpdate: () => rpc.request.checkForUpdate(),
    installUpdate: async () => {
      await rpc.request.installUpdate();
    },
  };
}
