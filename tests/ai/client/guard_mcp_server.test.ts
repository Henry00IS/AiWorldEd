import { describe, expect, it, vi } from 'vitest';
import type { BridgeMcpDesktop } from '@/ai/client/bridge_mcp_desktop.js';
import {
  MCP_SERVER_OTHER_RUNNING_LOCAL,
  MCP_SERVER_OTHER_RUNNING_ONLINE,
  mcpServerPairGuard,
} from '@/ai/client/guard_mcp_server.js';
import type { McpHostStatus } from '@/ai/shared/mcp_protocol_types.js';

/**
 * Fake MCP bridge with a mutable running flag.
 *
 * @param status Initial status.
 * @returns Bridge.
 */
function fakeBridge(status: McpHostStatus): BridgeMcpDesktop {
  return {
    startMcpServer: vi.fn(async () => {
      const next = { ...status, running: true };
      return { ok: true, message: 'MCP server started', status: next };
    }),
    stopMcpServer: vi.fn(async () => ({ ...status, running: false })),
    getMcpStatus: vi.fn(async () => status),
  };
}

/** Start guard: refuse one MCP server while the other is running. */
describe('mcpServerPairGuard', () => {
  it('starts the local server when the online server is stopped', async () => {
    const local = fakeBridge({ running: false, port: null, url: null });
    const online = fakeBridge({ running: false, port: null, url: 'https://relay.test/mcp/x' });
    const pair = mcpServerPairGuard(local, online);
    const result = await pair.local?.startMcpServer();
    expect(result?.ok).toBe(true);
    expect(local.startMcpServer).toHaveBeenCalledOnce();
    expect(online.startMcpServer).not.toHaveBeenCalled();
  });

  it('refuses to start the local server while the online server is running', async () => {
    const local = fakeBridge({ running: false, port: null, url: null });
    const online = fakeBridge({ running: true, port: null, url: 'https://relay.test/mcp/x' });
    const pair = mcpServerPairGuard(local, online);
    const result = await pair.local?.startMcpServer();
    expect(result).toEqual({
      ok: false,
      message: MCP_SERVER_OTHER_RUNNING_ONLINE,
      status: { running: false, port: null, url: null },
    });
    expect(local.startMcpServer).not.toHaveBeenCalled();
  });

  it('refuses to start the online server while the local server is running', async () => {
    const local = fakeBridge({ running: true, port: 18765, url: 'http://127.0.0.1:18765/mcp' });
    const online = fakeBridge({ running: false, port: null, url: 'https://relay.test/mcp/x' });
    const pair = mcpServerPairGuard(local, online);
    const result = await pair.online?.startMcpServer();
    expect(result).toEqual({
      ok: false,
      message: MCP_SERVER_OTHER_RUNNING_LOCAL,
      status: { running: false, port: null, url: 'https://relay.test/mcp/x' },
    });
    expect(online.startMcpServer).not.toHaveBeenCalled();
  });
});
