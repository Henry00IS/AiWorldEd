import type { SocketCollaborationMessage } from '@/collaboration/net/socket_collaboration_types.js';
import { SocketCollaborationError } from '@/collaboration/net/socket_collaboration_types.js';
import { transferFrameEncode } from '@/collaboration/shared/binary_frame.js';
import {
  TRANSFER_CHUNK_BYTES,
  TRANSFER_LINK_LIFETIME_MS,
  TRANSFER_LINK_PATTERN,
  TRANSFER_PATH_SEGMENT,
} from '@/collaboration/shared/protocol_definitions.js';
import { transferMimeSanitize, transferNameSanitize } from '@/collaboration/shared/transfer_file_policy.js';

/** Relay connection a transfer host talks through. */
export interface HostCollaborationTransferPort {
  /**
   * Sends a request and waits for the reply.
   *
   * @param message Message without `r`.
   * @returns Reply; rejects with SocketCollaborationError.
   */
  request(message: object): Promise<SocketCollaborationMessage>;
  /**
   * Sends a JSON message.
   *
   * @param message Message.
   */
  send(message: object): void;
  /**
   * Sends a binary frame.
   *
   * @param frame Frame bytes.
   */
  sendBinary(frame: Uint8Array): void;
}

/** A file shared through a transfer link. */
export interface HostCollaborationTransferShared {
  link: string;
  name: string;
  size: number;
  mime: string;
}

/** Downloads remembered at once; the relay never runs more per connection. */
const HOST_COLLABORATION_TRANSFER_QUERIES = 64;
/** How often a refused link request is retried. */
const HOST_COLLABORATION_TRANSFER_ATTEMPTS = 4;

/**
 * Serves files kept in memory to the relay: registers transfer links and
 * answers the relay's `transfer.get` and `transfer.chunk` requests. Links die
 * with the connection, so a new connection needs a new host.
 */
export class HostCollaborationTransfer {
  private readonly port: HostCollaborationTransferPort;
  private readonly files: Map<string, { blob: Blob; name: string }>;
  private readonly queries: Map<number, Blob>;

  /**
   * Creates a host for one relay connection.
   *
   * @param port Relay connection.
   */
  constructor(port: HostCollaborationTransferPort) {
    this.port = port;
    this.files = new Map();
    this.queries = new Map();
  }

  /**
   * Registers a link for a file, waiting out the relay's link interval.
   *
   * @param file File or blob; a blob needs a name.
   * @param name File name.
   * @returns Link and the cleaned file details.
   */
  async share(file: Blob, name: string): Promise<HostCollaborationTransferShared> {
    const link = await this.linkCreate(HOST_COLLABORATION_TRANSFER_ATTEMPTS);
    this.files.set(link, { blob: file, name });
    setTimeout(() => this.files.delete(link), TRANSFER_LINK_LIFETIME_MS);
    return { link, name: transferNameSanitize(name, link), size: file.size, mime: transferMimeSanitize(file.type) };
  }

  /**
   * Handles a relay message meant for the host.
   *
   * @param message Relay message.
   * @returns True when it was a transfer request.
   */
  handle(message: SocketCollaborationMessage): boolean {
    if (message.t === 'transfer.get') this.info(message);
    else if (message.t === 'transfer.chunk') void this.chunk(message);
    else return false;
    return true;
  }

  /** Forgets every file. */
  clear(): void {
    this.files.clear();
    this.queries.clear();
  }

  /**
   * Asks the relay for a link, retrying after a rate limit.
   *
   * @param attempts Tries left.
   * @returns Link id.
   */
  private async linkCreate(attempts: number): Promise<string> {
    try {
      const reply = await this.port.request({ t: 'transfer.create' });
      const link = reply['link'];
      if (typeof link !== 'string' || !TRANSFER_LINK_PATTERN.test(link)) throw new Error('invalid_link');
      return link;
    } catch (error) {
      const limited = error instanceof SocketCollaborationError && error.code === 'transfer_rate_limited';
      if (!limited || attempts <= 1) throw error;
      const waitMs = Number(error.details['retryAfterMs']) || 1000;
      await new Promise((resolve) => setTimeout(resolve, Math.min(waitMs, 10000)));
      return this.linkCreate(attempts - 1);
    }
  }

  /**
   * Answers `transfer.get` with the file details, or as missing.
   *
   * @param message `transfer.get {q, link}`.
   */
  private info(message: SocketCollaborationMessage): void {
    const q = Number(message['q']);
    const file = this.files.get(String(message['link']));
    if (file === undefined) return this.port.send({ t: 'transfer.missing', q });
    const oldest = this.queries.keys().next();
    if (this.queries.size >= HOST_COLLABORATION_TRANSFER_QUERIES && !oldest.done) this.queries.delete(oldest.value);
    this.queries.set(q, file.blob);
    this.port.send({ t: 'transfer.info', q, size: file.blob.size, name: file.name, mime: file.blob.type });
  }

  /**
   * Answers `transfer.chunk` with one binary chunk frame at any offset (range
   * requests). A query read again moves to the newest end, so the oldest
   * evicted query is one that stopped (an aborted range), not a running one.
   *
   * @param message `transfer.chunk {q, offset, length}`.
   */
  private async chunk(message: SocketCollaborationMessage): Promise<void> {
    const q = Number(message['q']);
    const offset = Number(message['offset']);
    const length = Math.min(Number(message['length']), TRANSFER_CHUNK_BYTES);
    const file = this.queries.get(q);
    if (file === undefined) return;
    this.queries.delete(q);
    if (offset + length < file.size) this.queries.set(q, file);
    const bytes = new Uint8Array(await file.slice(offset, offset + length).arrayBuffer());
    this.port.sendBinary(transferFrameEncode(q, offset, bytes));
  }
}

/**
 * Builds the public download URL of a link from the relay's WebSocket URL.
 *
 * @param relayUrl Relay WebSocket URL, e.g. `wss://host/ws`.
 * @param link Link id.
 * @returns HTTP URL `https://host/ws/transfer/<link>`.
 */
export function hostCollaborationTransferUrl(relayUrl: string, link: string): string {
  const url = new URL(relayUrl);
  url.protocol = url.protocol === 'ws:' ? 'http:' : 'https:';
  url.search = '';
  url.hash = '';
  url.pathname = `${url.pathname.replace(/\/+$/u, '')}/${TRANSFER_PATH_SEGMENT}/${link}`;
  return url.toString();
}
