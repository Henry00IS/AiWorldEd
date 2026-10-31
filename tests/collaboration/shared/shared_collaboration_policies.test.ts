import { describe, expect, it } from 'vitest';
import {
  binaryFrameCopyWithPeer,
  binaryFrameEncode,
  binaryFrameParse,
  binaryFramePayload,
} from '@/collaboration/shared/binary_frame.js';
import { PASSWORD_GENERATED_LENGTH_DEFAULT, passwordGenerate } from '@/collaboration/shared/password_generator.js';
import {
  PASSWORD_LENGTH_MAXIMUM,
  passwordPolicyEvaluate,
  passwordPolicyIsAcceptable,
} from '@/collaboration/shared/password_policy.js';
import {
  DISPLAY_NAME_LENGTH_MAXIMUM,
  ROOM_NAME_LENGTH_MAXIMUM,
  displayNameNormalize,
  roomNameNormalize,
} from '@/collaboration/shared/room_name_policy.js';

/** Policies shared verbatim with the relay through collab:shared:sync. */
describe('shared collaboration policies', () => {
  it('round-trips binary stream frames and rewrites the peer', () => {
    const payload = new Uint8Array([1, 2, 3, 4, 5]);
    const frame = binaryFrameEncode(9, 4, payload);
    const parsed = binaryFrameParse(frame, payload.byteLength);
    expect(parsed).toEqual({ stream: 9, peer: 4, payloadBytes: payload.byteLength });
    expect([...binaryFramePayload(frame)]).toEqual([...payload]);
    expect(binaryFrameParse(binaryFrameCopyWithPeer(frame, 11), payload.byteLength)?.peer).toBe(11);
    expect(binaryFrameParse(frame, payload.byteLength - 1)).toBeNull();
  });

  it('generates passwords that always satisfy the policy', () => {
    for (let index = 0; index < 50; index++) {
      const password = passwordGenerate();
      expect(password).toHaveLength(PASSWORD_GENERATED_LENGTH_DEFAULT);
      expect(passwordPolicyIsAcceptable(password)).toBe(true);
    }
  });

  it('reports why weak passwords fail', () => {
    expect(passwordPolicyEvaluate('aaaa').ok).toBe(false);
    expect(passwordPolicyIsAcceptable('password123')).toBe(false);
    expect(passwordPolicyIsAcceptable('abcd1234')).toBe(false);
    expect(passwordPolicyIsAcceptable('x'.repeat(PASSWORD_LENGTH_MAXIMUM + 1))).toBe(false);
  });

  it('limits room names to 128 characters and display names to 32', () => {
    expect(roomNameNormalize('  Level 1  ')).toEqual({ ok: true, name: 'Level 1' });
    expect(roomNameNormalize('a'.repeat(ROOM_NAME_LENGTH_MAXIMUM)).ok).toBe(true);
    expect(roomNameNormalize('a'.repeat(ROOM_NAME_LENGTH_MAXIMUM + 1)).ok).toBe(false);
    expect(roomNameNormalize('   ').ok).toBe(false);
    expect(roomNameNormalize('bad\u0007name').ok).toBe(false);
    expect(displayNameNormalize('b'.repeat(DISPLAY_NAME_LENGTH_MAXIMUM + 1)).ok).toBe(false);
  });
});
