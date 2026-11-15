import { describe, it, expect } from 'vitest';
import { createMcpSessionState, listMcpPortCandidates } from '@/ai/server/session_mcp.js';
import { MCP_DEFAULT_PORT } from '@/ai/shared/mcp_constants.js';
import { McpHost } from '@/ai/server/mcp_host.js';
import type { McpHttpServer } from '@/ai/server/mcp_host.js';
import { mcpEndpointFake } from './helpers_mcp_endpoint.js';

/** Unit tests for MCP session ports and host lifecycle with a fake server. */
describe('mcp_session', () => {
  it('lists ports starting at the default base', () => {
    const ports = listMcpPortCandidates();
    expect(ports[0]).toBe(MCP_DEFAULT_PORT);
    expect(ports.length).toBeGreaterThan(1);
  });

  it('creates a session state for a port', () => {
    const session = createMcpSessionState(MCP_DEFAULT_PORT);
    expect(session.port).toBe(MCP_DEFAULT_PORT);
  });

  it('starts and stops the host using a fake server factory', () => {
    const stops: boolean[] = [];
    const host = new McpHost((port, _fetch) => {
      const server: McpHttpServer = {
        port,
        stop: () => {
          stops.push(true);
        },
      };
      return server;
    });
    const started = host.start(mcpEndpointFake(async () => ({ ok: true, message: 'ok' })));
    expect(started.ok).toBe(true);
    expect(started.status.running).toBe(true);
    expect(started.status.url).toContain(String(MCP_DEFAULT_PORT));
    expect(started.status.url).toBe(`http://127.0.0.1:${MCP_DEFAULT_PORT}/mcp`);
    const stopped = host.stop();
    expect(stopped.running).toBe(false);
    expect(stops).toHaveLength(1);
  });
});
