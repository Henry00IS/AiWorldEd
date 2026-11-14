import { describe, expect, it, vi } from 'vitest';
import { BridgeMcpRelay } from '@/ai/client/relay/bridge_mcp_relay.js';
import { MCP_RELAY_TOKEN_PATTERN } from '@/ai/client/relay/token_mcp_relay.js';
import type { McpRelayLink } from '@/ai/client/relay/link_mcp_relay.js';
import { sharedMcpBridgeHandler } from '@/ai/client/handler_mcp_bridge.js';
import type { EditorApi } from '@/ai/client/editor_api.js';
import { RelayCollaborationMcp } from '@/collaboration/mcp/relay_collaboration_mcp.js';
import type { SocketCollaborationClient } from '@/collaboration/net/socket_collaboration_client.js';

/** A fake dev relay: one connection whose outgoing messages are recorded. */
interface FakeDevRelay {
  link: McpRelayLink;
  relay: RelayCollaborationMcp;
  sent: Record<string, unknown>[];
  listened: string[];
}

/**
 * Creates a fake dev relay at `wss://aiworlded.00labs.net/wsdev`.
 *
 * @param maxPayloadBytes Largest message the relay accepts.
 * @returns Fake relay with an MCP link.
 */
function fakeDevRelay(maxPayloadBytes = 1024 * 1024): FakeDevRelay {
  const sent: Record<string, unknown>[] = [];
  const listened: string[] = [];
  const client = {
    caps: new Set(['mcp', 'transfer']),
    limits: { maxPayloadBytes },
    isOpen: () => true,
    send: (message: Record<string, unknown>) => sent.push(message),
    request: async (message: Record<string, unknown>) => {
      listened.push(String(message['token']));
      return { t: 'mcp.listening' };
    },
  } as unknown as SocketCollaborationClient;
  const relay = new RelayCollaborationMcp(
    () => client,
    async () => undefined,
    () => true,
    () => 'wss://aiworlded.00labs.net/wsdev',
  );
  const link: McpRelayLink = {
    mcpUrl: async (token) => relay.url(token),
    mcpListen: (token, answer) => relay.listenStart(token, answer),
    mcpUnlisten: () => relay.listenStop(),
    mcpListening: () => relay.listening(),
  };
  return { link, relay, sent, listened };
}

/**
 * Creates an in-memory settings storage.
 *
 * @returns Storage.
 */
function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const values = new Map<string, string>();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => void values.set(key, value) };
}

/**
 * Lets the relay answer a request and returns the parsed response body.
 *
 * @param fake Fake relay.
 * @param q Relay request id.
 * @param request JSON-RPC request.
 * @returns Parsed response, or the raw empty body.
 */
async function relayPost(fake: FakeDevRelay, q: number, request: unknown): Promise<unknown> {
  fake.relay.handle({ t: 'mcp.request', q, body: JSON.stringify(request) });
  await vi.waitFor(() => expect(fake.sent.some((message) => message['q'] === q)).toBe(true));
  const body = String(fake.sent.find((message) => message['q'] === q)?.['body']);
  return body === '' ? body : JSON.parse(body);
}

describe('BridgeMcpRelay', () => {
  it('starts and stops listening with one stable relay URL that holds the token', async () => {
    const fake = fakeDevRelay();
    const bridge = new BridgeMcpRelay(fake.link, memoryStorage(), async () => ({ ok: true, message: '' }));
    const stopped = await bridge.getMcpStatus();
    expect(stopped.running).toBe(false);
    const token = stopped.url?.split('/').pop() ?? '';
    expect(token).toMatch(MCP_RELAY_TOKEN_PATTERN);
    expect(stopped.url).toBe(`https://aiworlded.00labs.net/wsdev/mcp/${token}`);
    const started = await bridge.startMcpServer();
    expect(started.ok).toBe(true);
    expect(started.status).toEqual({ running: true, port: null, url: stopped.url });
    expect(fake.listened).toEqual([token]);
    expect((await bridge.stopMcpServer()).running).toBe(false);
    expect(fake.sent).toContainEqual({ t: 'mcp.unlisten' });
    expect((await bridge.getMcpStatus()).url).toBe(stopped.url);
  });

  it('keeps the URL across editor sessions and changes it only on regenerate', async () => {
    const storage = memoryStorage();
    const fake = fakeDevRelay();
    const first = await new BridgeMcpRelay(fake.link, storage).getMcpStatus();
    const again = await new BridgeMcpRelay(fake.link, storage).getMcpStatus();
    expect(again.url).toBe(first.url);
    const renewed = await new BridgeMcpRelay(fake.link, storage).regenerateToken();
    expect(renewed.url).not.toBe(first.url);
    expect(renewed.url?.split('/').pop()).toMatch(MCP_RELAY_TOKEN_PATTERN);
  });

  it('answers forwarded requests through the shared MCP dispatcher and editor bridge', async () => {
    const invokeTool = vi.fn(() => ({ ok: true, message: 'listed' }));
    sharedMcpBridgeHandler.bindEditorApi({ invokeTool } as unknown as EditorApi);
    const fake = fakeDevRelay();
    const bridge = new BridgeMcpRelay(fake.link, memoryStorage());
    await bridge.startMcpServer();
    const init = (await relayPost(fake, 1, { jsonrpc: '2.0', id: 1, method: 'initialize' })) as {
      result: { serverInfo: { name: string } };
    };
    expect(init.result.serverInfo.name).toBe('aiworlded-solid-mcp');
    const list = (await relayPost(fake, 2, { jsonrpc: '2.0', id: 2, method: 'tools/list' })) as {
      result: { tools: { name: string }[] };
    };
    expect(list.result.tools.some((tool) => tool.name === 'list_solid_models')).toBe(true);
    const call = { jsonrpc: '2.0', id: 'c', method: 'tools/call', params: { name: 'list_solid_models' } };
    const called = (await relayPost(fake, 3, call)) as { id: string; result: { content: { text: string }[] } };
    expect(called.id).toBe('c');
    expect(called.result.content[0]?.text).toContain('listed');
    expect(invokeTool).toHaveBeenCalledWith('list_solid_models', {});
    expect(await relayPost(fake, 4, { jsonrpc: '2.0', method: 'notifications/initialized' })).toBe('');
  });

  it('replaces a response too large for one relay message with a JSON-RPC error of the same id', async () => {
    const fake = fakeDevRelay(512);
    const bridge = new BridgeMcpRelay(fake.link, memoryStorage(), async () => ({ ok: true, message: '' }));
    await bridge.startMcpServer();
    const answer = (await relayPost(fake, 5, { jsonrpc: '2.0', id: 9, method: 'tools/list' })) as {
      id: number;
      error: { code: number };
    };
    expect(answer.id).toBe(9);
    expect(answer.error.code).toBe(-32603);
  });

  it('reports a token already used by another tab', async () => {
    const link: McpRelayLink = {
      mcpUrl: async (token) => `https://relay/ws/mcp/${token}`,
      mcpListen: async () => Promise.reject(new Error('mcp_token_in_use')),
      mcpUnlisten: () => undefined,
      mcpListening: () => false,
    };
    const result = await new BridgeMcpRelay(link, memoryStorage()).startMcpServer();
    expect(result.ok).toBe(false);
    expect(result.message).toContain('another tab');
  });
});
