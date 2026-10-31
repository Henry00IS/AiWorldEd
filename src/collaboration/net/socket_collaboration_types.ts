/**
 * Minimal WebSocket surface used by the collaboration client (browser or test
 * socket).
 */
export interface SocketCollaborationLike {
  binaryType: string;
  readonly readyState: number;
  readonly bufferedAmount: number;
  send(data: string | Uint8Array): void;
  close(code?: number, reason?: string): void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number; reason: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

/** Creates a socket for a URL. */
export type SocketCollaborationFactory = (url: string) => SocketCollaborationLike;

/** Decoded JSON message from the relay. */
export interface SocketCollaborationMessage {
  t: string;
  r?: number;
  [field: string]: unknown;
}

/** Limits announced by the relay in its welcome message. */
export interface SocketCollaborationLimits {
  maxPayloadBytes: number;
  streamChunkBytes: number;
  streamWindowBytes: number;
  snapshotBytes: number;
  assetBytes: number;
  idsPerMessage: number;
  opsPerEdit: number;
  messagesPerSecond: number;
  usersPerRoom: number;
  locksPerUser: number;
}

/** Identity assigned by the relay. */
export interface SocketCollaborationWelcome {
  user: number;
  name: string;
  limits: SocketCollaborationLimits;
}

/** Receives relay traffic that is not a reply to a request. */
export interface SocketCollaborationListener {
  message(message: SocketCollaborationMessage): void;
  binary(frame: Uint8Array): void;
  closed(code: number, reason: string): void;
}

/** Error reply from the relay. */
export class SocketCollaborationError extends Error {
  readonly code: string;
  readonly details: SocketCollaborationMessage;

  /**
   * Creates an error from a relay error message.
   *
   * @param code Relay error code.
   * @param details Full error message.
   */
  constructor(code: string, details: SocketCollaborationMessage) {
    super(code);
    this.name = 'SocketCollaborationError';
    this.code = code;
    this.details = details;
  }
}

/** Limits assumed before the welcome message arrives. */
export const SOCKET_COLLABORATION_LIMITS_DEFAULT: SocketCollaborationLimits = {
  maxPayloadBytes: 1024 * 1024,
  streamChunkBytes: 256 * 1024,
  streamWindowBytes: 4 * 1024 * 1024,
  snapshotBytes: 256 * 1024 * 1024,
  assetBytes: 64 * 1024 * 1024,
  idsPerMessage: 4096,
  opsPerEdit: 256,
  messagesPerSecond: 120,
  usersPerRoom: 32,
  locksPerUser: 20000,
};

/**
 * Reads relay limits from a welcome message, keeping defaults for missing
 * fields.
 *
 * @param value Candidate limits object.
 * @returns Limits.
 */
export function socketCollaborationLimitsParse(value: unknown): SocketCollaborationLimits {
  const limits: SocketCollaborationLimits = { ...SOCKET_COLLABORATION_LIMITS_DEFAULT };
  if (typeof value !== 'object' || value === null) return limits;
  const source = value as Record<string, unknown>;
  (Object.keys(limits) as (keyof SocketCollaborationLimits)[]).forEach((key) => {
    const candidate = source[key];
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) limits[key] = candidate;
  });
  return limits;
}
