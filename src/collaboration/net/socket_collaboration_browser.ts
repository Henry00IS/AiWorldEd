import type { SocketCollaborationLike } from '@/collaboration/net/socket_collaboration_types.js';

/** Adapts the browser WebSocket to the collaboration socket surface. */
export class SocketCollaborationBrowser implements SocketCollaborationLike {
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number; reason: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  private readonly socket: WebSocket;

  /**
   * Opens a browser socket.
   *
   * @param url Relay URL.
   * @param create Creates the underlying WebSocket.
   */
  constructor(url: string, create: (url: string) => WebSocket = (target) => new WebSocket(target)) {
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    this.socket = create(url);
    this.socket.onopen = (event) => this.onopen?.(event);
    this.socket.onmessage = (event) => this.onmessage?.(event);
    this.socket.onclose = (event) => this.onclose?.(event);
    this.socket.onerror = (event) => this.onerror?.(event);
  }

  /**
   * Returns the binary type.
   *
   * @returns Binary type.
   */
  get binaryType(): string {
    return this.socket.binaryType;
  }

  /**
   * Sets the binary type.
   *
   * @param value 'arraybuffer' or 'blob'.
   */
  set binaryType(value: string) {
    this.socket.binaryType = value === 'blob' ? 'blob' : 'arraybuffer';
  }

  /**
   * Returns the ready state.
   *
   * @returns WebSocket ready state.
   */
  get readyState(): number {
    return this.socket.readyState;
  }

  /**
   * Returns the bytes queued for sending.
   *
   * @returns Buffered byte count.
   */
  get bufferedAmount(): number {
    return this.socket.bufferedAmount;
  }

  /**
   * Sends a text or binary frame.
   *
   * @param data Frame.
   */
  send(data: string | Uint8Array): void {
    this.socket.send(typeof data === 'string' ? data : (data as Uint8Array<ArrayBuffer>));
  }

  /**
   * Closes the socket.
   *
   * @param code Close code.
   * @param reason Close reason.
   */
  close(code?: number, reason?: string): void {
    this.socket.close(code, reason);
  }
}
