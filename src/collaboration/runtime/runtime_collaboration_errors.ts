import { SocketCollaborationError } from '@/collaboration/net/socket_collaboration_types.js';

/** User-facing text for relay error codes. */
const RUNTIME_COLLABORATION_ERROR_TEXT: Readonly<Record<string, string>> = {
  invalid_name: 'That name is not allowed.',
  weak_password: 'The password does not meet the password policy.',
  password_required: 'This room needs a password.',
  password_not_allowed: 'Public rooms cannot have a password.',
  wrong_password: 'Wrong password.',
  too_many_attempts: 'Too many attempts. Wait a moment and try again.',
  room_not_found: 'The room no longer exists.',
  room_full: 'The room is full.',
  room_limit_ip: 'You have created too many rooms. Close one first.',
  room_limit_server: 'The server cannot host more rooms right now.',
  already_in_room: 'You are already in a room.',
  busy: 'The server is busy. Try again.',
  timeout: 'The server did not answer in time.',
  closed: 'The connection was closed.',
};

/**
 * Converts any failure of a relay request into a sentence for the user.
 *
 * @param error Thrown value.
 * @returns Message for the user.
 */
export function runtimeCollaborationErrorText(error: unknown): string {
  const code = error instanceof SocketCollaborationError ? error.code : error instanceof Error ? error.message : '';
  return RUNTIME_COLLABORATION_ERROR_TEXT[code] ?? `The server refused the request (${code || 'unknown error'}).`;
}

/**
 * Returns the relay error code of a thrown value.
 *
 * @param error Thrown value.
 * @returns Code, or an empty string.
 */
export function runtimeCollaborationErrorCode(error: unknown): string {
  return error instanceof SocketCollaborationError ? error.code : '';
}

/** Close codes after which the client reconnects on its own. */
export const RUNTIME_COLLABORATION_RECONNECT_CODES: ReadonlySet<number> = new Set([1001, 1005, 1006, 1011, 4004, 4006]);

/**
 * Returns the delay before a reconnect attempt.
 *
 * @param attempt Attempt number starting at 0.
 * @returns Delay in milliseconds.
 */
export function runtimeCollaborationBackoff(attempt: number): number {
  return Math.min(30000, 1000 * 2 ** Math.min(attempt, 5));
}
