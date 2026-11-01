import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  lookCollaborationPresenceDecode,
  lookCollaborationPresenceEncode,
  lookCollaborationPresenceFlags,
  lookCollaborationPresenceMotion,
} from '@/collaboration/presence/look_collaboration_presence.js';
import {
  PRESENCE_CHARACTER_FLAG_GROUNDED,
  PRESENCE_CHARACTER_FLAG_RUN,
  PRESENCE_CHARACTER_FLAG_WALL_PUSH,
  PRESENCE_ID_CHARACTER,
  presenceFrameDecode,
  presenceFrameEncode,
  presenceFrameRelay,
} from '@/collaboration/shared/presence_frame.js';

/**
 * Packs a look, sends it through the wire format and unpacks it.
 *
 * @param bodyYaw Body facing.
 * @param lookYaw Absolute look yaw.
 * @param pitch Look pitch.
 * @returns Decoded look.
 */
function wire(bodyYaw: number, lookYaw: number, pitch: number): ReturnType<typeof lookCollaborationPresenceDecode> {
  const q = lookCollaborationPresenceEncode(bodyYaw, lookYaw, pitch, new THREE.Quaternion());
  const frame = presenceFrameEncode([
    { id: PRESENCE_ID_CHARACTER, position: [0, 0, 0], quaternion: [q.x, q.y, q.z, q.w], fov: 0 },
  ]);
  const entry = presenceFrameDecode(presenceFrameRelay(frame, 7))?.entries[0];
  return lookCollaborationPresenceDecode(new THREE.Quaternion(...(entry?.quaternion ?? [0, 0, 0, 1])));
}

/**
 * Angle difference wrapped to [-PI, PI].
 *
 * @param a First angle.
 * @param b Second angle.
 * @returns Wrapped difference.
 */
function angleDelta(a: number, b: number): number {
  const d = a - b;
  return d - 2 * Math.PI * Math.round(d / (2 * Math.PI));
}

describe('lookCollaborationPresence packing', () => {
  it('round-trips body facing, relative look yaw and pitch through the wire', () => {
    const cases: [number, number, number][] = [
      [0, 0, 0],
      [1, 1.5, 0.4],
      [-2.5, 2.5, -1.2],
      [3.1, -3.1, 1.5],
      [0.3, 0.3 + Math.PI - 0.01, -1.55],
      [0.3, 0.3 - Math.PI + 0.01, 1.55],
    ];
    cases.forEach(([body, look, pitch]) => {
      const decoded = wire(body, look, pitch);
      expect(Math.abs(angleDelta(decoded.bodyYaw, body))).toBeLessThan(0.01);
      expect(Math.abs(angleDelta(decoded.yaw, angleDelta(look, body)))).toBeLessThan(0.02);
      expect(Math.abs(decoded.pitch - pitch)).toBeLessThan(0.01);
    });
  });

  it('clamps pitch beyond straight up or down', () => {
    expect(wire(0, 0, 4).pitch).toBeCloseTo(Math.PI / 2, 2);
    expect(wire(0, 0, -4).pitch).toBeCloseTo(-Math.PI / 2, 2);
  });

  it('turns garbage into a finite, forward look', () => {
    const q = lookCollaborationPresenceEncode(Number.NaN, Number.POSITIVE_INFINITY, Number.NaN, new THREE.Quaternion());
    [q.x, q.y, q.z, q.w].forEach((value) => expect(Number.isFinite(value)).toBe(true));
    const decoded = lookCollaborationPresenceDecode(q);
    expect(decoded).toEqual({ bodyYaw: 0, yaw: 0, pitch: 0 });
    const garbage = lookCollaborationPresenceDecode(new THREE.Quaternion(Number.NaN, 0, 0, 1));
    [garbage.bodyYaw, garbage.yaw, garbage.pitch].forEach((value) => expect(Number.isFinite(value)).toBe(true));
  });
});

describe('lookCollaborationPresence motion flags', () => {
  it('round-trips every combination', () => {
    [false, true].forEach((grounded) =>
      [false, true].forEach((wallPushing) =>
        [false, true].forEach((running) => {
          const motion = { grounded, wallPushing, running };
          expect(lookCollaborationPresenceMotion(lookCollaborationPresenceFlags(motion))).toEqual(motion);
        }),
      ),
    );
    expect(lookCollaborationPresenceFlags({ grounded: true, wallPushing: true, running: true })).toBe(
      PRESENCE_CHARACTER_FLAG_GROUNDED | PRESENCE_CHARACTER_FLAG_WALL_PUSH | PRESENCE_CHARACTER_FLAG_RUN,
    );
  });

  it('ignores unknown bits', () => {
    expect(lookCollaborationPresenceMotion(0xf8)).toEqual({ grounded: false, wallPushing: false, running: false });
  });
});
