import { createConnection, type Socket } from 'node:net';
import type { DiscordIpcTransport, DiscordIpcTransportHandlers } from './discord_ipc_transport.js';

/**
 * Connects to a Discord IPC named pipe or Unix socket with Node's net module.
 *
 * @param path Named pipe or Unix socket path.
 * @param handlers Data, close, and error callbacks.
 * @returns Connected transport.
 */
export function discordIpcTransportConnectNet(
  path: string,
  handlers: DiscordIpcTransportHandlers,
): Promise<DiscordIpcTransport> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ path });
    discordIpcTransportBindConnect(socket, handlers, resolve, reject);
  });
}

/**
 * Binds connect, error, and later data handlers on a new socket.
 *
 * @param socket Connecting socket.
 * @param handlers Data, close, and error callbacks.
 * @param resolve Completes the connect promise.
 * @param reject Fails the connect promise.
 */
function discordIpcTransportBindConnect(
  socket: Socket,
  handlers: DiscordIpcTransportHandlers,
  resolve: (transport: DiscordIpcTransport) => void,
  reject: (error: Error) => void,
): void {
  const onError = (error: Error) => reject(error);
  socket.once('error', onError);
  socket.once('connect', () => {
    socket.off('error', onError);
    resolve(discordIpcTransportFromSocket(socket, handlers));
  });
}

/**
 * Wraps a connected socket as a Discord IPC transport.
 *
 * @param socket Connected socket.
 * @param handlers Data, close, and error callbacks.
 * @returns Transport bound to the socket.
 */
function discordIpcTransportFromSocket(socket: Socket, handlers: DiscordIpcTransportHandlers): DiscordIpcTransport {
  socket.on('data', (chunk: Buffer) => handlers.onData(new Uint8Array(chunk)));
  socket.on('close', () => handlers.onClose());
  socket.on('error', () => handlers.onError());
  return {
    write: (bytes) => discordIpcTransportSocketWrite(socket, bytes),
    close: () => socket.destroy(),
  };
}

/**
 * Writes frame bytes to a connected socket, ignoring write failures.
 *
 * @param socket Connected socket.
 * @param bytes Encoded frame bytes.
 */
function discordIpcTransportSocketWrite(socket: Socket, bytes: Uint8Array): void {
  try {
    socket.write(bytes);
  } catch {
    return;
  }
}
