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
import {
  hostCollaborationTransferThumbnail,
  hostCollaborationTransferThumbnailName,
  type HostCollaborationTransferThumbnailRender,
} from './host_collaboration_transfer_thumbnail.js';

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

/** A download being served: the bytes, and the link when they are its preview. */
interface HostCollaborationTransferQuery {
  blob: Blob;
  thumbnail: string | null;
}

/** A link preview kept while its downloads run, shared by all of them. */
interface HostCollaborationTransferPreview {
  png: Promise<Blob | null>;
  timer: ReturnType<typeof setTimeout> | null;
}

/** How long an unfinished preview download keeps the PNG after its last chunk. */
export const HOST_COLLABORATION_TRANSFER_PREVIEW_KEEP_MS = 30_000;

/** Downloads remembered at once; the relay never runs more per connection. */
const HOST_COLLABORATION_TRANSFER_QUERIES = 64;
/** How often a refused link request is retried. */
const HOST_COLLABORATION_TRANSFER_ATTEMPTS = 4;

/**
 * Serves files kept in memory to the relay: registers transfer links and
 * answers the relay's `transfer.get` and `transfer.chunk` requests. Links die
 * with the connection, so a new connection needs a new host. A `transfer.get`
 * with `thumbnail` is answered with a PNG preview, rendered once and shared by
 * the downloads running at the time: it is dropped as soon as none is left
 * unfinished, or 30 seconds after the last chunk any of them fetched.
 */
export class HostCollaborationTransfer {
  private readonly port: HostCollaborationTransferPort;
  private readonly render: HostCollaborationTransferThumbnailRender;
  private readonly files: Map<string, { blob: Blob; name: string }>;
  private readonly queries: Map<number, HostCollaborationTransferQuery>;
  private readonly previews: Map<string, HostCollaborationTransferPreview>;

  /**
   * Creates a host for one relay connection.
   *
   * @param port Relay connection.
   * @param render Renders the PNG preview of a file.
   */
  constructor(
    port: HostCollaborationTransferPort,
    render: HostCollaborationTransferThumbnailRender = hostCollaborationTransferThumbnail,
  ) {
    this.port = port;
    this.render = render;
    this.files = new Map();
    this.queries = new Map();
    this.previews = new Map();
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

  /** Forgets every file and preview. */
  clear(): void {
    for (const link of [...this.previews.keys()]) this.previewDrop(link);
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
   * Answers `transfer.get` with the file or preview details, or as missing.
   *
   * @param message `transfer.get {q, link, thumbnail?}`.
   */
  private info(message: SocketCollaborationMessage): void {
    const q = Number(message['q']);
    const link = String(message['link']);
    const file = this.files.get(link);
    if (file === undefined) return this.port.send({ t: 'transfer.missing', q });
    if (message['thumbnail'] === true) return void this.previewInfo(q, link, file);
    this.queryAnswer(q, { blob: file.blob, thumbnail: null }, file.name);
  }

  /**
   * Remembers a download and announces its bytes.
   *
   * @param q Query id.
   * @param query Bytes to serve.
   * @param name Announced name.
   */
  private queryAnswer(q: number, query: HostCollaborationTransferQuery, name: string): void {
    const oldest = this.queries.keys().next();
    if (this.queries.size >= HOST_COLLABORATION_TRANSFER_QUERIES && !oldest.done) this.queries.delete(oldest.value);
    this.queries.set(q, query);
    this.port.send({ t: 'transfer.info', q, size: query.blob.size, name, mime: query.blob.type });
  }

  /**
   * Answers a preview request with the link's PNG, rendering it only when no
   * download holds it, or as missing when the file has no preview.
   *
   * @param q Query id.
   * @param link Link id.
   * @param file Shared file.
   */
  private async previewInfo(q: number, link: string, file: { blob: Blob; name: string }): Promise<void> {
    let preview = this.previews.get(link);
    if (preview === undefined) {
      preview = { png: this.render(file.blob, file.name).catch(() => null), timer: null };
      this.previews.set(link, preview);
    }
    const png = await preview.png;
    if (png === null || this.previews.get(link) !== preview) {
      if (this.previews.get(link) === preview) this.previewDrop(link);
      return this.port.send({ t: 'transfer.missing', q });
    }
    this.previewKeep(link, preview);
    this.queryAnswer(q, { blob: png, thumbnail: link }, hostCollaborationTransferThumbnailName(file.name));
  }

  /**
   * Restarts the countdown after which an unfinished preview is dropped.
   *
   * @param link Link id.
   * @param preview Its preview.
   */
  private previewKeep(link: string, preview: HostCollaborationTransferPreview): void {
    if (preview.timer !== null) clearTimeout(preview.timer);
    preview.timer = setTimeout(() => this.previewDrop(link), HOST_COLLABORATION_TRANSFER_PREVIEW_KEEP_MS);
  }

  /**
   * Drops a link's preview and fails its unfinished downloads.
   *
   * @param link Link id.
   */
  private previewDrop(link: string): void {
    const preview = this.previews.get(link);
    if (preview?.timer) clearTimeout(preview.timer);
    this.previews.delete(link);
    for (const [q, query] of this.queries) if (query.thumbnail === link) this.queries.delete(q);
  }

  /**
   * Keeps a preview after one of its chunks was served while a download still
   * needs it, and drops it otherwise.
   *
   * @param link Link id.
   */
  private previewServed(link: string): void {
    const preview = this.previews.get(link);
    const pending = [...this.queries.values()].some((query) => query.thumbnail === link);
    if (preview !== undefined && pending) this.previewKeep(link, preview);
    else this.previewDrop(link);
  }

  /**
   * Answers `transfer.chunk` with one binary chunk frame at any offset (range
   * requests). A query read again moves to the newest end, so the oldest
   * evicted query is one that stopped (an aborted range), not a running one. A
   * dropped preview's downloads get no answer, so the relay fails them.
   *
   * @param message `transfer.chunk {q, offset, length}`.
   */
  private async chunk(message: SocketCollaborationMessage): Promise<void> {
    const q = Number(message['q']);
    const offset = Number(message['offset']);
    const length = Math.min(Number(message['length']), TRANSFER_CHUNK_BYTES);
    const query = this.queries.get(q);
    if (query === undefined) return;
    this.queries.delete(q);
    if (offset + length < query.blob.size) this.queries.set(q, query);
    if (query.thumbnail !== null) this.previewServed(query.thumbnail);
    const bytes = new Uint8Array(await query.blob.slice(offset, offset + length).arrayBuffer());
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
