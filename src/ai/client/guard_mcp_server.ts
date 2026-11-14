import type { BridgeMcpDesktop } from './bridge_mcp_desktop.js';
import type { McpHostStartResult, McpHostStatus } from '@/ai/shared/mcp_protocol_types.js';

/** Shown when starting the local server while the online server is running. */
export const MCP_SERVER_OTHER_RUNNING_ONLINE = 'Stop the online MCP server before starting the local server.';

/** Shown when starting the online server while the local server is running. */
export const MCP_SERVER_OTHER_RUNNING_LOCAL = 'Stop the local MCP server before starting the online server.';

/** Bridge that may also replace its online token. */
interface BridgeMcpGuarded extends BridgeMcpDesktop {
  regenerateToken?: () => Promise<McpHostStatus>;
}

/**
 * Wraps a start method so it refuses while the other MCP server is running.
 *
 * @param bridge Server being started.
 * @param other The other server, if present.
 * @param message Refusal message when the other server is running.
 * @returns Start result.
 */
export async function mcpServerStartGuarded(
  bridge: BridgeMcpDesktop,
  other: BridgeMcpDesktop | null,
  message: string,
): Promise<McpHostStartResult> {
  if (other !== null) {
    const otherStatus = await other.getMcpStatus();
    if (otherStatus.running) {
      return { ok: false, message, status: await bridge.getMcpStatus() };
    }
  }
  return bridge.startMcpServer();
}

/**
 * Returns a bridge whose start method refuses while `other` is running. Other
 * methods are delegated as they are.
 *
 * @param bridge Bridge to wrap.
 * @param other The other server, if present.
 * @param message Refusal message when the other server is running.
 * @returns Guarded bridge of the same shape.
 */
export function mcpServerGuard<T extends BridgeMcpDesktop>(
  bridge: T,
  other: BridgeMcpDesktop | null,
  message: string,
): T {
  const guarded: BridgeMcpGuarded = {
    startMcpServer: () => mcpServerStartGuarded(bridge, other, message),
    stopMcpServer: () => bridge.stopMcpServer(),
    getMcpStatus: () => bridge.getMcpStatus(),
  };
  const token = (bridge as BridgeMcpGuarded).regenerateToken;
  if (typeof token === 'function') {
    guarded.regenerateToken = () => token.call(bridge);
  }
  return guarded as T;
}

/**
 * Guards a local and online MCP pair so starting one refuses while the other is
 * running.
 *
 * @param local Desktop local bridge, if any.
 * @param online Online relay bridge, if any.
 * @returns The same pair with guarded start methods.
 */
export function mcpServerPairGuard<Local extends BridgeMcpDesktop, Online extends BridgeMcpDesktop>(
  local: Local | null,
  online: Online | null,
): { local: Local | null; online: Online | null } {
  return {
    local: local ? mcpServerGuard(local, online, MCP_SERVER_OTHER_RUNNING_ONLINE) : null,
    online: online ? mcpServerGuard(online, local, MCP_SERVER_OTHER_RUNNING_LOCAL) : null,
  };
}
