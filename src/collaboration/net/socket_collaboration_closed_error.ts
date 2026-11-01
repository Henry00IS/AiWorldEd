/**
 * Failure raised when the relay socket closes before a request or the handshake
 * completed. Keeps the close code, the relay's close reason, the relay URL and
 * whether the socket ever opened, so the editor can tell "cannot reach the
 * relay" apart from an explicit refusal.
 */
export class SocketCollaborationClosedError extends Error {
  readonly closeCode: number;
  readonly closeReason: string;
  readonly relayUrl: string;
  readonly socketOpened: boolean;

  /**
   * Creates the failure.
   *
   * @param closeCode WebSocket close code.
   * @param closeReason Close reason sent by the relay, or an empty string.
   * @param relayUrl Relay WebSocket URL.
   * @param socketOpened True when the socket opened before it closed.
   */
  constructor(closeCode: number, closeReason: string, relayUrl: string, socketOpened: boolean) {
    super(`closed ${closeCode}`);
    this.name = 'SocketCollaborationClosedError';
    this.closeCode = closeCode;
    this.closeReason = closeReason;
    this.relayUrl = relayUrl;
    this.socketOpened = socketOpened;
  }
}
