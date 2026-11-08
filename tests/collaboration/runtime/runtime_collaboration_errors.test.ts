import { describe, expect, it } from 'vitest';
import {
  RUNTIME_COLLABORATION_RECONNECT_CODES,
  RUNTIME_COLLABORATION_RETRY_JITTER_MS,
  RUNTIME_COLLABORATION_RETRY_MS,
  runtimeCollaborationRetryDelay,
  runtimeCollaborationErrorCode,
  runtimeCollaborationErrorMessage,
  runtimeCollaborationErrorText,
  runtimeCollaborationJoinFailure,
} from '@/collaboration/runtime/runtime_collaboration_errors.js';
import { SocketCollaborationError } from '@/collaboration/net/socket_collaboration_types.js';

/** Relay error texts and reconnect policy. */
describe('runtime_collaboration_errors', () => {
  it('maps relay error codes to readable text', () => {
    const error = new SocketCollaborationError('wrong_password', { t: 'error', code: 'wrong_password' });
    expect(runtimeCollaborationErrorText(error)).toBe('Wrong password.');
    expect(runtimeCollaborationErrorCode(error)).toBe('wrong_password');
    expect(runtimeCollaborationErrorText(new Error('mystery'))).toContain('mystery');
    expect(runtimeCollaborationErrorCode('x')).toBe('');
  });

  it('maps a wrong password on join to its own message and lets the user retype it', () => {
    const wrong = new SocketCollaborationError('wrong_password', { t: 'error', code: 'wrong_password' });
    expect(runtimeCollaborationJoinFailure(wrong)).toEqual({ text: 'Wrong password.', retry: true });
    const full = new SocketCollaborationError('room_full', { t: 'error', code: 'room_full' });
    expect(runtimeCollaborationJoinFailure(full)).toEqual({ text: 'The room is full.', retry: false });
    expect(runtimeCollaborationErrorMessage('wrong_password')).toBe('Wrong password.');
    expect(runtimeCollaborationErrorMessage('')).toBe('The server refused the request (unknown error).');
  });

  it('reconnects on abnormal closes only, at most once per cooldown', () => {
    expect(RUNTIME_COLLABORATION_RECONNECT_CODES.has(1006)).toBe(true);
    expect(RUNTIME_COLLABORATION_RECONNECT_CODES.has(1000)).toBe(false);
    expect(RUNTIME_COLLABORATION_RETRY_MS).toBe(5000);
    expect(runtimeCollaborationRetryDelay(-Infinity, 1000, 0.9)).toBe(0);
    expect(runtimeCollaborationRetryDelay(0, 5000, 0.9)).toBe(0);
    expect(runtimeCollaborationRetryDelay(0, 0, 0)).toBe(5000);
    expect(runtimeCollaborationRetryDelay(0, 4000, 0.5)).toBe(1000 + RUNTIME_COLLABORATION_RETRY_JITTER_MS / 2);
    expect(runtimeCollaborationRetryDelay(0, 0, 0.999)).toBeLessThanOrEqual(
      5000 + RUNTIME_COLLABORATION_RETRY_JITTER_MS,
    );
  });
});

/**
 * Only actual software mismatch gets the fork-install dialog; lifecycle errors
 * remain generic.
 */
it('distinguishes incompatibility from owner timeouts, departure and other join failures', () => {
  const mismatch = runtimeCollaborationJoinFailure(
    new SocketCollaborationError('client_incompatible', { t: 'error', homeUrl: 'https://owner.invalid/editor' }),
  );
  expect(mismatch).toMatchObject({ incompatible: true, homeUrl: 'https://owner.invalid/editor' });
  for (const code of ['owner_timeout', 'owner_left', 'room_full']) {
    const failure = runtimeCollaborationJoinFailure(new SocketCollaborationError(code, { t: 'error' }));
    expect(failure.incompatible).not.toBe(true);
    expect(failure.text).not.toContain('incompatible');
  }
});
