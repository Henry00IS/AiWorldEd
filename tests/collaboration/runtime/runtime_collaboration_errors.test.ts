import { describe, expect, it } from 'vitest';
import {
  RUNTIME_COLLABORATION_RECONNECT_CODES,
  runtimeCollaborationBackoff,
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

  it('reconnects on abnormal closes only, with capped exponential backoff', () => {
    expect(RUNTIME_COLLABORATION_RECONNECT_CODES.has(1006)).toBe(true);
    expect(RUNTIME_COLLABORATION_RECONNECT_CODES.has(1000)).toBe(false);
    expect(runtimeCollaborationBackoff(0)).toBe(1000);
    expect(runtimeCollaborationBackoff(1)).toBe(2000);
    expect(runtimeCollaborationBackoff(50)).toBe(30000);
  });
});
