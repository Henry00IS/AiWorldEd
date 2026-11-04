import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SocketCollaborationLike } from '@/collaboration/net/socket_collaboration_types.js';
import { ConnectionCollaborationTransfer } from '@/collaboration/transfer/connection_collaboration_transfer.js';

/** In-memory socket the test answers by hand. */
class FakeSocket implements SocketCollaborationLike {
  binaryType = 'blob';
  readyState = 0;
  bufferedAmount = 0;
  sent: string[] = [];
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  /**
   * Records a sent text frame.
   *
   * @param data Frame.
   */
  send(data: string | Uint8Array): void {
    if (typeof data === 'string') this.sent.push(data);
  }

  /** Closes like the browser: the close event follows. */
  close(): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.({ code: 1006, reason: '' });
  }

  /**
   * Opens the socket and answers the hello.
   *
   * @param caps Relay capabilities.
   */
  welcome(caps: string[]): void {
    this.readyState = 1;
    this.onopen?.({});
    this.deliver({ t: 'welcome', user: 3, name: 'Henry', caps, limits: {} });
  }

  /**
   * Delivers a JSON message.
   *
   * @param message Message.
   */
  deliver(message: object): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

/**
 * Creates a stopped connection whose sockets the test controls.
 *
 * @returns Connection and the sockets it opened.
 */
function fixture(): { connection: ConnectionCollaborationTransfer; sockets: FakeSocket[] } {
  const sockets: FakeSocket[] = [];
  const connection = new ConnectionCollaborationTransfer({
    factory: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    url: () => 'wss://relay.test/wsdev',
    name: () => 'Henry',
  });
  return { connection, sockets };
}

afterEach(() => {
  vi.useRealTimers();
});

/** Always-on relay connection for public MCP capture links. */
describe('connection_collaboration_transfer', () => {
  it('shares files once connected to a relay with transfer links', async () => {
    const { connection, sockets } = fixture();
    connection.start();
    await expect(connection.share(new Blob(['x']), 'a.png')).rejects.toThrow('transfer_unavailable');
    sockets[0]?.welcome(['transfer']);
    await vi.waitFor(() => expect(connection.available()).toBe(true));
    const pending = connection.share(new Blob(['x'], { type: 'image/png' }), 'a.png');
    await vi.waitFor(() => expect(sockets[0]?.sent.some((frame) => frame.includes('transfer.create'))).toBe(true));
    const request = JSON.parse(sockets[0]?.sent.find((frame) => frame.includes('transfer.create')) ?? '{}');
    sockets[0]?.deliver({ t: 'transfer.created', r: request.r, link: 'k'.repeat(43), expiresInMs: 3_600_000 });
    expect(await pending).toBe(`https://relay.test/wsdev/transfer/${'k'.repeat(43)}`);
    connection.stop();
    expect(connection.available()).toBe(false);
  });

  it('is unavailable on a relay without transfer links', async () => {
    const { connection, sockets } = fixture();
    connection.start();
    sockets[0]?.welcome([]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(connection.available()).toBe(false);
    connection.stop();
  });

  it('reconnects with a growing delay after the connection drops', async () => {
    vi.useFakeTimers();
    const { connection, sockets } = fixture();
    connection.start();
    sockets[0]?.welcome(['transfer']);
    await vi.advanceTimersByTimeAsync(0);
    sockets[0]?.close();
    expect(connection.available()).toBe(false);
    await vi.advanceTimersByTimeAsync(999);
    expect(sockets.length).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets.length).toBe(2);
    sockets[1]?.close();
    await vi.advanceTimersByTimeAsync(1999);
    expect(sockets.length).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets.length).toBe(3);
    connection.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sockets.length).toBe(3);
  });
});
