import { afterEach, describe, expect, it } from 'vitest';
import {
  SocketCollaborationClient,
  socketCollaborationParse,
} from '@/collaboration/net/socket_collaboration_client.js';
import {
  SocketCollaborationError,
  type SocketCollaborationLike,
  type SocketCollaborationMessage,
} from '@/collaboration/net/socket_collaboration_types.js';

/** In-memory socket that records sent frames and lets the test answer. */
class FakeSocket implements SocketCollaborationLike {
  binaryType = 'blob';
  readyState = 0;
  bufferedAmount = 0;
  sent: (string | Uint8Array)[] = [];
  closedWith: number | null = null;
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  /**
   * Records a sent frame.
   *
   * @param data Frame.
   */
  send(data: string | Uint8Array): void {
    this.sent.push(data);
  }

  /**
   * Records a local close.
   *
   * @param code Close code.
   */
  close(code?: number): void {
    this.closedWith = code ?? 1000;
  }

  /** Opens the socket. */
  open(): void {
    this.readyState = 1;
    this.onopen?.({});
  }

  /**
   * Delivers a JSON message.
   *
   * @param message Message.
   */
  deliver(message: object): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  /**
   * Returns the parsed JSON frames sent so far.
   *
   * @returns Messages.
   */
  messages(): SocketCollaborationMessage[] {
    return this.sent.flatMap((frame) => {
      const parsed = typeof frame === 'string' ? socketCollaborationParse(frame) : null;
      return parsed === null ? [] : [parsed];
    });
  }
}

/**
 * Creates a client with a fake socket and recording listener.
 *
 * @returns Client, socket and received events.
 */
function clientCreate(): {
  client: SocketCollaborationClient;
  socket: FakeSocket;
  received: SocketCollaborationMessage[];
  closes: number[];
} {
  const socket = new FakeSocket();
  const received: SocketCollaborationMessage[] = [];
  const closes: number[] = [];
  const client = new SocketCollaborationClient(() => socket, {
    message: (message) => received.push(message),
    binary: () => undefined,
    closed: (code) => closes.push(code),
  });
  return { client, socket, received, closes };
}

const clients: SocketCollaborationClient[] = [];

afterEach(() => clients.splice(0).forEach((client) => client.close()));

/**
 * Connects a client and completes the hello handshake.
 *
 * @returns Connected client parts.
 */
async function clientConnected(): Promise<ReturnType<typeof clientCreate>> {
  const parts = clientCreate();
  clients.push(parts.client);
  const welcome = parts.client.connect('ws://relay.test/ws', 'Alice');
  parts.socket.open();
  parts.socket.deliver({ t: 'welcome', user: 7, name: 'Alice', limits: { idsPerMessage: 10 } });
  const result = await welcome;
  expect(result.user).toBe(7);
  expect(result.limits.idsPerMessage).toBe(10);
  return parts;
}

/** Browser-side relay connection: handshake, request/reply and closing. */
describe('socket_collaboration_client', () => {
  it('sends hello and resolves the welcome', async () => {
    const { socket } = await clientConnected();
    expect(socket.messages()[0]?.t).toBe('hello');
    expect(socket.binaryType).toBe('arraybuffer');
  });

  it('leaves an empty display name out of hello so the relay names the member', async () => {
    const { client, socket } = clientCreate();
    clients.push(client);
    const welcome = client.connect('ws://relay.test/ws', '  ');
    socket.open();
    expect(socket.messages()[0]).not.toHaveProperty('name');
    socket.deliver({ t: 'welcome', user: 3, name: 'User 3', limits: {} });
    await expect(welcome).resolves.toMatchObject({ user: 3 });
  });

  it('sends a trimmed display name in hello', async () => {
    const { client, socket } = clientCreate();
    clients.push(client);
    void client.connect('ws://relay.test/ws', ' Alice ').catch(() => undefined);
    socket.open();
    expect(socket.messages()[0]?.['name']).toBe('Alice');
  });

  it('matches replies to requests and turns error replies into typed errors', async () => {
    const { client, socket, received } = await clientConnected();
    const ok = client.request({ t: 'room.list' });
    const failed = client.request({ t: 'room.join' });
    const [first, second] = socket.messages().slice(-2);
    socket.deliver({ t: 'room.list', r: first?.r, rooms: [] });
    socket.deliver({ t: 'error', r: second?.r, code: 'wrong_password' });
    socket.deliver({ t: 'presence', user: 2 });
    await expect(ok).resolves.toMatchObject({ t: 'room.list' });
    await expect(failed).rejects.toBeInstanceOf(SocketCollaborationError);
    expect(received.map((message) => message.t)).toEqual(['presence']);
  });

  it('fails pending requests and reports an abnormal close', async () => {
    const { client, socket, closes } = await clientConnected();
    const pending = client.request({ t: 'room.list' });
    socket.onclose?.({ code: 1006, reason: '' });
    await expect(pending).rejects.toThrow('closed 1006');
    expect(closes).toEqual([1006]);
    expect(client.isOpen()).toBe(false);
  });

  it('rejects the handshake on a relay error and ignores malformed frames', async () => {
    const { client, socket } = clientCreate();
    clients.push(client);
    const welcome = client.connect('ws://relay.test/ws', 'Bob');
    socket.open();
    socket.onmessage?.({ data: 'not json' });
    socket.deliver({ t: 'error', code: 'unsupported_version' });
    await expect(welcome).rejects.toBeInstanceOf(SocketCollaborationError);
    expect(socketCollaborationParse('{"x":1}')).toBeNull();
  });
});
