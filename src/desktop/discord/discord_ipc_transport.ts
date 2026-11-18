/** Callbacks invoked by a Discord IPC transport. */
export interface DiscordIpcTransportHandlers {
  /**
   * Receives a chunk of bytes from the socket.
   *
   * @param chunk Incoming bytes.
   */
  onData(chunk: Uint8Array): void;
  /** Called when the socket closes. */
  onClose(): void;
  /** Called when the socket reports an error. */
  onError(): void;
}

/** A connected Discord IPC socket. */
export interface DiscordIpcTransport {
  /**
   * Writes a complete frame to the socket.
   *
   * @param bytes Encoded frame bytes.
   */
  write(bytes: Uint8Array): void;
  /** Closes the socket. */
  close(): void;
}

/**
 * Opens a Discord IPC socket at a path.
 *
 * @param path Named pipe or Unix socket path.
 * @param handlers Data, close, and error callbacks.
 * @returns Connected transport.
 */
export type DiscordIpcTransportConnect = (
  path: string,
  handlers: DiscordIpcTransportHandlers,
) => Promise<DiscordIpcTransport>;
