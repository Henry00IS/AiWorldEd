import { describe, expect, it, vi } from 'vitest';
import {
  RELAY_COLLABORATION_MCP_OFFLINE,
  RELAY_COLLABORATION_MCP_UNSUPPORTED,
  RelayCollaborationMcp,
} from '@/collaboration/mcp/relay_collaboration_mcp.js';
import type { SocketCollaborationClient } from '@/collaboration/net/socket_collaboration_client.js';
import { SocketCollaborationError } from '@/collaboration/net/socket_collaboration_types.js';

/** A fake relay connection that records what the editor sends. */
interface FakeRelayConnection {
  client: SocketCollaborationClient;
  sent: Record<string, unknown>[];
  requests: Record<string, unknown>[];
}

/**
 * Creates a fake relay connection.
 *
 * @param caps Capabilities the relay agreed.
 * @param maxPayloadBytes Largest message the relay accepts.
 * @returns Fake connection and its recorded traffic.
 */
function fakeRelayConnection(caps: string[] = ['mcp'], maxPayloadBytes = 1024 * 1024): FakeRelayConnection {
  const sent: Record<string, unknown>[] = [];
  const requests: Record<string, unknown>[] = [];
  const client = {
    caps: new Set(caps),
    limits: { maxPayloadBytes },
    isOpen: () => true,
    send: (message: Record<string, unknown>) => sent.push(message),
    request: vi.fn(async (message: Record<string, unknown>) => {
      requests.push(message);
      return { t: 'mcp.listening' };
    }),
  } as unknown as SocketCollaborationClient;
  return { client, sent, requests };
}

/** Waits for queued promise callbacks. */
async function settle(): Promise<void> {
  for (let index = 0; index < 5; index += 1) await Promise.resolve();
}

/** A valid 64 character token. */
const TOKEN = 'A'.repeat(32) + '_-'.repeat(16);

describe('RelayCollaborationMcp', () => {
  it('listens on a token and answers mcp.request with mcp.response', async () => {
    const connection = fakeRelayConnection();
    const relay = new RelayCollaborationMcp(
      () => connection.client,
      async () => undefined,
      () => true,
      () => 'wss://relay.test/ws',
    );
    const answer = vi.fn(async (body: string) => `echo:${body}`);
    await relay.listenStart(TOKEN, answer);
    expect(connection.requests).toEqual([{ t: 'mcp.listen', token: TOKEN }]);
    expect(relay.listening()).toBe(true);
    expect(relay.handle({ t: 'mcp.request', q: 7, body: '{"ping":1}' })).toBe(true);
    await settle();
    expect(answer).toHaveBeenCalledWith('{"ping":1}', expect.any(Function));
    expect(connection.sent).toContainEqual({ t: 'mcp.response', q: 7, body: 'echo:{"ping":1}' });
  });

  it('ignores malformed requests and leaves other messages to the runtime', async () => {
    const connection = fakeRelayConnection();
    const relay = new RelayCollaborationMcp(
      () => connection.client,
      async () => undefined,
      () => true,
      () => 'wss://relay.test/ws',
    );
    const answer = vi.fn(async () => 'x');
    await relay.listenStart(TOKEN, answer);
    expect(relay.handle({ t: 'mcp.request', q: -1, body: '{}' })).toBe(true);
    expect(relay.handle({ t: 'mcp.request', q: 2 ** 32, body: '{}' })).toBe(true);
    expect(relay.handle({ t: 'mcp.request', q: 1, body: 5 })).toBe(true);
    expect(relay.handle({ t: 'chat', text: 'hi' })).toBe(false);
    await settle();
    expect(answer).not.toHaveBeenCalled();
  });

  it('refuses invalid tokens, offline runtimes and relays without the mcp capability', async () => {
    const connection = fakeRelayConnection([]);
    const relay = new RelayCollaborationMcp(
      () => connection.client,
      async () => undefined,
      () => true,
      () => 'wss://relay.test/ws',
    );
    await expect(relay.listenStart('short', async () => '')).rejects.toThrow('Invalid MCP token');
    await expect(relay.listenStart(`${TOKEN}=`, async () => '')).rejects.toThrow('Invalid MCP token');
    await expect(relay.listenStart(TOKEN, async () => '')).rejects.toThrow(RELAY_COLLABORATION_MCP_UNSUPPORTED);
    const offline = new RelayCollaborationMcp(
      () => connection.client,
      async () => undefined,
      () => false,
      () => 'wss://relay.test/ws',
    );
    await expect(offline.listenStart(TOKEN, async () => '')).rejects.toThrow(RELAY_COLLABORATION_MCP_OFFLINE);
    expect(connection.requests).toEqual([]);
  });

  it('passes the mcp_token_in_use refusal through and stays stopped', async () => {
    const connection = fakeRelayConnection();
    vi.mocked(connection.client.request).mockRejectedValueOnce(
      new SocketCollaborationError('mcp_token_in_use', { t: 'error', code: 'mcp_token_in_use' }),
    );
    const relay = new RelayCollaborationMcp(
      () => connection.client,
      async () => undefined,
      () => true,
      () => 'wss://relay.test/ws',
    );
    await expect(relay.listenStart(TOKEN, async () => '')).rejects.toThrow('mcp_token_in_use');
    expect(relay.listening()).toBe(false);
  });

  it('listens again on the new connection after a reconnect and unlistens on stop', async () => {
    let connection = fakeRelayConnection();
    const relay = new RelayCollaborationMcp(
      () => connection.client,
      async () => undefined,
      () => true,
      () => 'wss://relay.test/ws',
    );
    await relay.listenStart(TOKEN, async () => '');
    connection = fakeRelayConnection();
    relay.connected();
    expect(connection.requests).toEqual([{ t: 'mcp.listen', token: TOKEN }]);
    relay.listenStop();
    expect(connection.sent).toContainEqual({ t: 'mcp.unlisten' });
    expect(relay.listening()).toBe(false);
  });

  it('tells the answer whether a response fits one relay message', async () => {
    const connection = fakeRelayConnection(['mcp'], 64);
    const relay = new RelayCollaborationMcp(
      () => connection.client,
      async () => undefined,
      () => true,
      () => 'wss://relay.test/ws',
    );
    const verdicts: boolean[] = [];
    await relay.listenStart(TOKEN, async (_body, fits) => {
      verdicts.push(fits('small'), fits('x'.repeat(64)));
      return 'small';
    });
    relay.handle({ t: 'mcp.request', q: 3, body: '{}' });
    await settle();
    expect(verdicts).toEqual([true, false]);
  });
});
