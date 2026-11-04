import { SocketCollaborationClient } from '@/collaboration/net/socket_collaboration_client.js';
import type { SocketCollaborationFactory } from '@/collaboration/net/socket_collaboration_types.js';
import {
  HostCollaborationTransfer,
  hostCollaborationTransferUrl,
} from '@/collaboration/transfer/host_collaboration_transfer.js';

/** Longest wait between two reconnect attempts. */
const CONNECTION_COLLABORATION_TRANSFER_RETRY_MAXIMUM_MS = 30000;

/** Where and as whom the transfer connection connects. */
export interface ConnectionCollaborationTransferOptions {
  factory: SocketCollaborationFactory;
  /**
   * Returns the relay URL.
   *
   * @returns Relay WebSocket URL.
   */
  url(): string;
  /**
   * Returns the display name.
   *
   * @returns Name.
   */
  name(): string;
}

/**
 * Relay connection that stays open outside rooms and reconnects on its own, so
 * files (e.g. MCP captures) can be shared as public transfer links at any
 * time.
 */
export class ConnectionCollaborationTransfer {
  private readonly options: ConnectionCollaborationTransferOptions;
  private client: SocketCollaborationClient | null;
  private host: HostCollaborationTransfer | null;
  private relayUrl: string;
  private attempt: number;
  private timer: ReturnType<typeof setTimeout> | null;
  private running: boolean;

  /**
   * Creates a stopped connection.
   *
   * @param options Socket factory, URL and name.
   */
  constructor(options: ConnectionCollaborationTransferOptions) {
    this.options = options;
    this.client = null;
    this.host = null;
    this.relayUrl = '';
    this.attempt = 0;
    this.timer = null;
    this.running = false;
  }

  /** Connects and keeps reconnecting until stop(). */
  start(): void {
    if (this.running) return;
    this.running = true;
    void this.open();
  }

  /** Closes the connection; its links stop working. */
  stop(): void {
    this.running = false;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    const client = this.client;
    this.drop();
    client?.close();
  }

  /**
   * Returns whether links can be created right now.
   *
   * @returns True when connected to a relay with transfer links.
   */
  available(): boolean {
    return this.host !== null && this.client !== null && this.client.isOpen() && this.client.caps.has('transfer');
  }

  /**
   * Shares a file and returns its public download URL.
   *
   * @param file File bytes.
   * @param name File name.
   * @returns Download URL; rejects when the relay is unavailable.
   */
  async share(file: Blob, name: string): Promise<string> {
    if (!this.available() || this.host === null) throw new Error('transfer_unavailable');
    const shared = await this.host.share(file, name);
    return hostCollaborationTransferUrl(this.relayUrl, shared.link);
  }

  /** Opens one connection attempt. */
  private async open(): Promise<void> {
    this.timer = null;
    const client: SocketCollaborationClient = new SocketCollaborationClient(this.options.factory, {
      message: (message) => void (this.client === client && this.host?.handle(message)),
      binary: () => undefined,
      closed: () => this.lost(client),
    });
    this.client = client;
    this.relayUrl = this.options.url();
    try {
      await client.connect(this.relayUrl, this.options.name());
      if (this.client !== client) return client.close();
      this.host = new HostCollaborationTransfer(client);
      this.attempt = 0;
    } catch {
      this.lost(client);
    }
  }

  /**
   * Forgets a lost connection and schedules the next attempt.
   *
   * @param client Connection that was lost.
   */
  private lost(client: SocketCollaborationClient): void {
    if (this.client !== client) return;
    this.drop();
    client.close();
    if (!this.running) return;
    const delay = Math.min(CONNECTION_COLLABORATION_TRANSFER_RETRY_MAXIMUM_MS, 1000 * 2 ** this.attempt);
    this.attempt = Math.min(this.attempt + 1, 5);
    this.timer = setTimeout(() => void this.open(), delay);
  }

  /** Forgets the current connection and its files. */
  private drop(): void {
    this.host?.clear();
    this.host = null;
    this.client = null;
  }
}
