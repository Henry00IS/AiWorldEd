import type { McpHostStartResult, McpHostStatus } from '@/ai/shared/mcp_protocol_types.js';
import type { ElectrobunDesktopBunRpcClient } from '@/ai/shared/mcp_rpc_schema.js';

/** Start, stop, and status methods for the MCP host. */
export interface BridgeMcpDesktop {
  startMcpServer: () => Promise<McpHostStartResult>;
  stopMcpServer: () => Promise<McpHostStatus>;
  getMcpStatus: () => Promise<McpHostStatus>;
}

declare global {
  interface Window {
    aiworldedMcpBridge?: BridgeMcpDesktop;
  }
}

/**
 * Creates a desktop MCP bridge backed by Electrobun Bun RPC.
 *
 * @param rpc Typed RPC client connected to the Bun process.
 * @returns MCP desktop bridge.
 */
export function createMcpDesktopBridge(rpc: ElectrobunDesktopBunRpcClient): BridgeMcpDesktop {
  return {
    startMcpServer: () => rpc.request.startMcpServer(),
    stopMcpServer: () => rpc.request.stopMcpServer(),
    getMcpStatus: () => rpc.request.getMcpStatus(),
  };
}

/**
 * Returns the MCP desktop bridge stored on the window, if any.
 *
 * @returns The bridge when set on the window; otherwise null.
 */
export function getMcpDesktopBridge(): BridgeMcpDesktop | null {
  if (typeof window === 'undefined') return null;
  return window.aiworldedMcpBridge ?? null;
}
