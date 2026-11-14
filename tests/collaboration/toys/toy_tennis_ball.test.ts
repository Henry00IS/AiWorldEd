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
  TOY_HAND_PAYLOAD_BYTES,
  TOY_PAPER_PLANE_PAYLOAD_BYTES,
  TOY_TENNIS_BALL_PAYLOAD_BYTES,
  TOY_TENNIS_BALL_VELOCITY_SCALE,
  TOY_TYPE_HAND,
  TOY_TYPE_PAPER_PLANE,
  TOY_TYPE_SOCCER_BALL,
  toyHandDecode,
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
  it('round-trip in 18-byte entries (position in the fixed part, 8-byte payload), quantized to millimeters', () => {
    const resting = { ...ball(2, 30.001), sleeping: true, velocity: [0, 0, 0] as [number, number, number] };
    const one = toyFrameEncode(toyTennisBallEncode({ full: false, tick: 1, balls: [ball(1)] }));
    expect([one.byteLength, toyFrameRelay(one, 9).byteLength]).toEqual([38, 42]);
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
    const short = { ...entry, payload: entry.payload.slice(0, 7) };
    const long = { ...entry, payload: new Uint8Array(9) };
    const outOfRange = { ...entry, payload: entry.payload.slice() };
    new DataView(outOfRange.payload.buffer).setInt16(1, -32768);
    [short, long, outOfRange].forEach((bad) => expect(toyTennisBallDecode({ ...frame, entries: [bad] })).toBeNull());
  });
});

describe('toy spawn count', () => {
  it('rides in its own payload byte of every kind, leaving velocity at full precision', () => {
    (['tennis', 'soccer', 'plane'] as const).forEach((kind) => {
      for (const spawn of [0, 1, 7, 128, 255]) {
        const toy = { ...ball(1), kind, velocity: [-31, 0, 3.3] as [number, number, number], spawn };
        const decoded = toyTennisBallDecode(relay({ full: true, tick: 1, balls: [toy] }))?.balls[0];
        expect([decoded?.kind ?? 'tennis', decoded?.spawn]).toEqual([kind, spawn]);
        expect(toyTennisBallEncode({ full: true, tick: 1, balls: [toy] }).entries[0]?.payload[7]).toBe(spawn);
        decoded?.velocity.forEach((value, axis) =>
          expect(Math.abs(value - (toy.velocity[axis] ?? 0))).toBeLessThanOrEqual(0.5 / TOY_TENNIS_BALL_VELOCITY_SCALE),
        );
      }
    });
  });
});

describe('soccer ball, paper plane and hand toys', () => {
  const plane: PlayerBallState = { ...ball(2), kind: 'plane', attitude: [-2.5, 0.4, -0.3] };
  const soccer: PlayerBallState = { ...ball(3), kind: 'soccer', sleeping: true, velocity: [0, 0, 0] };

  it('round-trip: soccer 18-byte entries, plane 22-byte entries with attitude, hand 11 bytes', () => {
    const sizes = (snapshot: PlayerBallSnapshot): number => toyFrameEncode(toyTennisBallEncode(snapshot)).byteLength;
    expect(sizes({ full: false, tick: 1, balls: [soccer] })).toBe(20 + 10 + TOY_TENNIS_BALL_PAYLOAD_BYTES);
    expect(sizes({ full: false, tick: 1, balls: [plane] })).toBe(20 + 10 + TOY_PAPER_PLANE_PAYLOAD_BYTES);
    expect(sizes({ full: true, tick: 1, balls: [], held: 'soccer' })).toBe(20 + 10 + TOY_HAND_PAYLOAD_BYTES);
    const frame = relay({ full: true, tick: 5, balls: [ball(1), plane, soccer], held: 'plane' });
    expect(frame.entries.map((entry) => [entry.type, entry.id, entry.payload.byteLength])).toEqual([
      [TOY_TYPE_TENNIS_BALL, 1, 8],
      [TOY_TYPE_PAPER_PLANE, 2, 12],
      [TOY_TYPE_SOCCER_BALL, 3, 8],
      [TOY_TYPE_HAND, 4, 1],
    ]);
    const toys = toyTennisBallDecode(frame)?.balls ?? [];
    expect(toys.map((toy) => [toy.id, toy.kind ?? 'tennis', toy.sleeping])).toEqual([
      [1, 'tennis', false],
      [2, 'plane', false],
      [3, 'soccer', true],
    ]);
    const [yaw, pitch, roll] = toys[1]?.attitude ?? [];
    expect(Math.abs((yaw ?? 0) + 2.5)).toBeLessThan(1e-4);
    expect(Math.abs((pitch ?? 0) - 0.4)).toBeLessThan(0.007);
    expect(Math.abs((roll ?? 0) + 0.3)).toBeLessThan(0.007);
    expect(toys[1]?.velocity).toEqual([14, -3.5, 0.25]);
    expect(toyHandDecode(frame)).toBe('plane');
  });

  it('leaves the hand out when four toys take every id, and never announces it unasked', () => {
    const four = [1, 2, 3, 4].map((id) => ball(id));
    expect(toyTennisBallEncode({ full: true, tick: 1, balls: four, held: 'plane' }).entries).toHaveLength(4);
    expect(toyHandDecode(relay({ full: true, tick: 1, balls: [ball(1)] }))).toBeUndefined();
  });

  it('rejects a plane payload of the wrong length or with an out-of-range angle, ignores a bad hand', () => {
    const frame = relay({ full: true, tick: 1, balls: [plane], held: 'tennis' });
    const [entry, hand] = frame.entries;
    if (entry === undefined || hand === undefined) throw new Error('missing entry');
    const short = { ...entry, payload: entry.payload.slice(0, TOY_TENNIS_BALL_PAYLOAD_BYTES) };
    const badPitch = { ...entry, payload: entry.payload.slice() };
    new DataView(badPitch.payload.buffer).setInt8(10, -128);
    [short, badPitch].forEach((bad) => expect(toyTennisBallDecode({ ...frame, entries: [bad] })).toBeNull());
    expect(toyHandDecode({ ...frame, entries: [{ ...hand, payload: Uint8Array.of(77) }] })).toBeUndefined();
    expect(toyHandDecode({ ...frame, entries: [{ ...hand, payload: new Uint8Array(2) }] })).toBeUndefined();
  });
});
