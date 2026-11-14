import { describe, expect, it } from 'vitest';
import {
  TOY_FLAG_GROUNDED,
  TOY_FLAG_SLEEPING,
  TOY_PRECISION_BITS_MAXIMUM,
  TOY_TYPE_TENNIS_BALL,
  toyFrameDecode,
  toyFrameEncode,
  toyFrameRelay,
  type ToyFrame,
} from '@/collaboration/shared/toy_frame.js';
import {
  TOY_TENNIS_BALL_PAYLOAD_BYTES,
  TOY_TENNIS_BALL_VELOCITY_SCALE,
  toyTennisBallDecode,
  toyTennisBallEncode,
} from '@/collaboration/toys/toy_tennis_ball.js';
import type { PlayerBallSnapshot, PlayerBallState } from '@/player/ball/player_ball_link.js';

/**
 * Builds a flying ball that bounced three times, the last at 6.3 m/s.
 *
 * @param id Ball id.
 * @param x Position x.
 * @returns State.
 */
function ball(id: number, x = 1.5): PlayerBallState {
  return {
    ...{ id, position: [x, -2.25, 1000], velocity: [14, -3.5, 0.25], sleeping: false, rolling: false },
    ...{ bounces: 3, strength: 6.3 },
  };
}

/**
 * Sends a snapshot through the codec and the relay.
 *
 * @param snapshot Balls.
 * @returns Decoded frame.
 */
function relay(snapshot: PlayerBallSnapshot): ToyFrame {
  const decoded = toyFrameDecode(toyFrameRelay(toyFrameEncode(toyTennisBallEncode(snapshot)), 9));
  if (decoded === null) throw new Error('rejected');
  return decoded;
}

describe('tennis ball toys', () => {
  it('round-trip in 17-byte entries (position in the fixed part, 7-byte payload), quantized to millimeters', () => {
    const resting = { ...ball(2, 30.001), sleeping: true, velocity: [0, 0, 0] as [number, number, number] };
    const one = toyFrameEncode(toyTennisBallEncode({ full: false, tick: 1, balls: [ball(1)] }));
    expect([one.byteLength, toyFrameRelay(one, 9).byteLength]).toEqual([37, 41]);
    const rolling = { ...ball(3), rolling: true, bounces: 17, strength: 99 };
    const frame = relay({ full: true, tick: 70_000, balls: [ball(1), resting, rolling] });
    expect(frame.entries.map((entry) => [entry.type, entry.flags, entry.payload.byteLength])).toEqual([
      [TOY_TYPE_TENNIS_BALL, 0, TOY_TENNIS_BALL_PAYLOAD_BYTES],
      [TOY_TYPE_TENNIS_BALL, TOY_FLAG_SLEEPING, TOY_TENNIS_BALL_PAYLOAD_BYTES],
      [TOY_TYPE_TENNIS_BALL, TOY_FLAG_GROUNDED, TOY_TENNIS_BALL_PAYLOAD_BYTES],
    ]);
    const balls = toyTennisBallDecode(frame)?.balls ?? [];
    expect(balls.map((state) => [state.id, state.sleeping, state.rolling, state.bounces, state.strength])).toEqual([
      [1, false, false, 3, 6],
      [2, true, false, 3, 6],
      [3, false, true, 1, 30],
    ]);
    balls[0]?.position.forEach((value, axis) =>
      expect(Math.abs(value - (ball(1).position[axis] ?? 0))).toBeLessThan(0.002),
    );
    expect(balls[0]?.velocity).toEqual([14, -3.5, 0.25]);
  });

  it('coarsens the precision for far apart balls and clamps fast velocities', () => {
    const far = [ball(1, -300), { ...ball(2, 300), velocity: [200, 0, 0] as [number, number, number] }];
    expect(toyTennisBallEncode({ full: true, tick: 1, balls: far }).bits).toBe(6);
    expect(toyTennisBallEncode({ full: true, tick: 1, balls: [ball(1)] }).bits).toBe(TOY_PRECISION_BITS_MAXIMUM);
    const balls = toyTennisBallDecode(relay({ full: false, tick: 1, balls: far }))?.balls;
    expect(Math.abs((balls?.[1]?.position[0] ?? 0) - 300)).toBeLessThan(1 / 64);
    expect(balls?.[1]?.velocity[0]).toBeCloseTo(32767 / TOY_TENNIS_BALL_VELOCITY_SCALE, 5);
  });

  it('ignores toy types it does not know', () => {
    const frame = relay({ full: true, tick: 1, balls: [ball(1)] });
    const unknown = {
      type: 200,
      id: 2,
      flags: 0,
      position: [0, 0, 0] as [number, number, number],
      payload: new Uint8Array(22),
    };
    const decoded = toyTennisBallDecode({ ...frame, entries: [unknown, ...frame.entries] });
    expect(decoded?.balls.map((state) => state.id)).toEqual([1]);
  });

  it('rejects a frame whose ball payload has the wrong length or an out-of-range velocity', () => {
    const frame = relay({ full: true, tick: 1, balls: [ball(1)] });
    const entry = frame.entries[0];
    if (entry === undefined) throw new Error('missing entry');
    const short = { ...entry, payload: entry.payload.slice(0, 6) };
    const long = { ...entry, payload: new Uint8Array(8) };
    const outOfRange = { ...entry, payload: entry.payload.slice() };
    new DataView(outOfRange.payload.buffer).setInt16(1, -32768);
    [short, long, outOfRange].forEach((bad) => expect(toyTennisBallDecode({ ...frame, entries: [bad] })).toBeNull());
  });
});
