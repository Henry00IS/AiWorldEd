import { discordIpcFrameEncode, DiscordIpcFrameReader } from '@/desktop/discord/discord_ipc_frame.js';
import type {
  DiscordIpcTransport,
  DiscordIpcTransportConnect,
  DiscordIpcTransportHandlers,
} from '@/desktop/discord/discord_ipc_transport.js';

/** Fake Discord IPC socket that records writes and accepts injected frames. */
export class DiscordIpcFakeSocket implements DiscordIpcTransport {
  readonly writes: Uint8Array[] = [];
  private handlers: DiscordIpcTransportHandlers | null = null;
  closed = false;

  /**
   * Binds transport handlers after a successful connect.
   *
   * @param handlers Data, close, and error callbacks.
   */
  bind(handlers: DiscordIpcTransportHandlers): void {
    this.handlers = handlers;
  }

  /**
   * Records an outgoing frame.
   *
   * @param bytes Encoded frame bytes.
   */
  write(bytes: Uint8Array): void {
    this.writes.push(bytes);
  }

  /** Marks the socket closed and notifies the client. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.handlers?.onClose();
  }

  /**
   * Injects raw bytes as if they arrived from Discord.
   *
   * @param bytes Incoming bytes.
   */
  receive(bytes: Uint8Array): void {
    this.handlers?.onData(bytes);
  }

  /**
   * Injects one encoded IPC frame.
   *
   * @param opcode Frame opcode.
   * @param payload JSON-serializable body.
   */
  receivePayload(opcode: number, payload: unknown): void {
    this.receive(discordIpcFrameEncode(opcode, payload));
  }

  /** Notifies the client of a socket error. */
  error(): void {
    this.handlers?.onError();
  }

  /**
   * Decodes every recorded write as IPC frames.
   *
   * @returns Decoded frames in write order.
   */
  writtenFrames(): { opcode: number; payload: unknown }[] {
    const reader = new DiscordIpcFrameReader();
    const frames: { opcode: number; payload: unknown }[] = [];
    for (const write of this.writes) frames.push(...reader.push(write));
    return frames;
  }
}

/**
 * Waits until the fake socket has recorded at least one write.
 *
 * @param socket Fake Discord socket.
 * @param minimumWrites Required write count, defaulting to one.
 * @returns Resolves when enough writes are present.
 */
export async function discordIpcFakeWaitForWrite(
  socket: DiscordIpcFakeSocket,
  minimumWrites: number = 1,
): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (socket.writes.length >= minimumWrites) return;
    await Promise.resolve();
  }
  throw new Error('Discord IPC fake socket received no write');
}

/**
 * Yields several microtasks so pending handshake or flush work can finish.
 *
 * @returns Resolves after a short microtask drain.
 */
export async function discordIpcFakeFlushMicrotasks(): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) await Promise.resolve();
}

/**
 * Creates a connect function that succeeds only for the listed paths.
 *
 * @param sockets Map of path to the fake socket that should be returned.
 * @returns Transport connect function.
 */
export function discordIpcFakeConnect(sockets: Map<string, DiscordIpcFakeSocket>): DiscordIpcTransportConnect {
  return async (path, handlers) => {
    const socket = sockets.get(path);
    if (socket === undefined) throw new Error(`no fake socket for ${path}`);
    socket.bind(handlers);
    return socket;
  };
}
