import { SocketCollaborationClosedError } from '@/collaboration/net/socket_collaboration_closed_error.js';
import { CLOSE_CODES } from '@/collaboration/shared/protocol_definitions.js';

/**
 * Close codes of relay refusals that a retry cannot fix, so the editor never
 * reconnects after them.
 */
export const RUNTIME_COLLABORATION_REFUSAL_CODES: ReadonlySet<number> = new Set([
  CLOSE_CODES.originRefused,
  CLOSE_CODES.proxyRefused,
  CLOSE_CODES.tooManyConnections,
  CLOSE_CODES.protocolUnsupported,
]);

/**
 * Close code the browser reports when the socket could not be opened or dropped
 * without a close frame.
 */
const RUNTIME_COLLABORATION_CLOSE_ABNORMAL = 1006;

/**
 * Explains a close code.
 *
 * @param code Close code.
 * @param pageOrigin Origin of the editor page, named in origin refusals.
 * @returns Message.
 */
export function runtimeCollaborationCloseText(
  code: number,
  pageOrigin: string = runtimeCollaborationPageOrigin(),
): string {
  if (code === CLOSE_CODES.rateLimited) return 'The server disconnected you for sending too much too quickly.';
  if (code === CLOSE_CODES.serverFull) return 'The relay is full (it reached its connection limit). Try again later.';
  if (code === CLOSE_CODES.protocolViolation)
    return 'The server rejected a message from this editor (protocol violation).';
  if (code === CLOSE_CODES.abuse)
    return 'The server disconnected you for misusing edit locks. You can rejoin the room in a minute.';
  if (code === CLOSE_CODES.protocolUnsupported)
    return 'This editor and the collaboration server speak different protocol versions. Update your editor.';
  if (code === CLOSE_CODES.originRefused) return runtimeCollaborationOriginRefusedText(pageOrigin);
  if (code === CLOSE_CODES.proxyRefused) return runtimeCollaborationProxyRefusedText();
  if (code === CLOSE_CODES.tooManyConnections) return runtimeCollaborationTooManyConnectionsText();
  return 'The connection to the collaboration server was lost. You are working offline.';
}

/**
 * Explains a socket that closed before a request completed: an unreachable
 * relay names its URL, a refusal explains what the relay admin must change.
 *
 * @param error Closed-socket failure.
 * @param pageOrigin Origin of the editor page, named in origin refusals.
 * @returns Message.
 */
export function runtimeCollaborationClosedErrorText(
  error: SocketCollaborationClosedError,
  pageOrigin: string = runtimeCollaborationPageOrigin(),
): string {
  if (!error.socketOpened && error.closeCode === RUNTIME_COLLABORATION_CLOSE_ABNORMAL) {
    return runtimeCollaborationUnreachableText(error.relayUrl);
  }
  if (error.closeCode === RUNTIME_COLLABORATION_CLOSE_ABNORMAL)
    return 'The connection to the relay dropped. Try again.';
  return runtimeCollaborationCloseText(error.closeCode, pageOrigin);
}

/**
 * Returns whether a failure is a relay refusal that a retry cannot fix.
 *
 * @param error Thrown value.
 * @returns True for origin, proxy and connection-limit refusals.
 */
export function runtimeCollaborationRefusalIs(error: unknown): error is SocketCollaborationClosedError {
  return error instanceof SocketCollaborationClosedError && RUNTIME_COLLABORATION_REFUSAL_CODES.has(error.closeCode);
}

/**
 * Explains an unreachable relay.
 *
 * @param relayUrl Relay WebSocket URL.
 * @returns Message.
 */
function runtimeCollaborationUnreachableText(relayUrl: string): string {
  return (
    `Cannot reach the relay at ${relayUrl}. Check the address, that the relay is running, ` +
    'and that its certificate is trusted by this browser.'
  );
}

/**
 * Explains an origin refusal.
 *
 * @param pageOrigin Origin of the editor page.
 * @returns Message.
 */
function runtimeCollaborationOriginRefusedText(pageOrigin: string): string {
  return `This relay doesn't allow editors from ${pageOrigin}. Ask its admin to add it to ALLOWED_ORIGINS.`;
}

/**
 * Explains a reverse proxy refusal.
 *
 * @returns Message.
 */
function runtimeCollaborationProxyRefusedText(): string {
  return (
    "The relay refused this connection because its reverse proxy sent the wrong forwarding secret. Ask the relay's " +
    'admin to check FORWARDED_SECRET in the relay and proxy settings.'
  );
}

/**
 * Explains a per-address connection limit refusal.
 *
 * @returns Message.
 */
function runtimeCollaborationTooManyConnectionsText(): string {
  return 'This relay refused the connection: too many connections from your address. Close other editor windows and try again.';
}

/**
 * Returns the origin of the editor page.
 *
 * @returns Page origin, or a placeholder outside a browser.
 */
function runtimeCollaborationPageOrigin(): string {
  return typeof location === 'undefined' ? 'this page' : location.origin;
}
