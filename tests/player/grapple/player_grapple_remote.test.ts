import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { toyFrameDecode, toyFrameEncode, toyFrameRelay } from '@/collaboration/shared/toy_frame.js';
import { toyTennisBallDecode, toyTennisBallEncode } from '@/collaboration/toys/toy_tennis_ball.js';
import type { PlayerBallSnapshot } from '@/player/ball/player_ball_link.js';
import {
  PlayerGrappleRemote,
  playerGrappleEntry,
  playerGrappleMissEntry,
  TOY_TYPE_GRAPPLE,
} from '@/player/grapple/player_grapple_remote.js';

/**
 * Sends a snapshot through the toy codec and the relay.
 *
 * @param snapshot Snapshot.
 * @returns Decoded snapshot.
 */
function relay(snapshot: PlayerBallSnapshot): PlayerBallSnapshot | null {
  const frame = toyFrameDecode(toyFrameRelay(toyFrameEncode(toyTennisBallEncode(snapshot)), 9));
  return frame && toyTennisBallDecode(frame);
}

describe('grapple beam networking', () => {
  it('carries the anchor in a toy entry next to the balls, and the gun as the held toy', () => {
    const snapshot: PlayerBallSnapshot = {
      full: true,
      tick: 7,
      held: 'grapple',
      balls: [
        { id: 1, position: [1, 2, 3], velocity: [0, 0, 0], sleeping: true, rolling: false, bounces: 0, strength: 0 },
      ],
      grapple: playerGrappleEntry(2, new THREE.Vector3(30.25, 14.5, -60.125)),
    };
    const decoded = relay(snapshot);
    expect(decoded?.held).toBe('grapple');
    expect(decoded?.balls.map((ball) => ball.id)).toEqual([1]);
    expect(decoded?.grapple?.type).toBe(TOY_TYPE_GRAPPLE);
    decoded?.grapple?.position.forEach((value, axis) =>
      expect(value).toBeCloseTo([30.25, 14.5, -60.125][axis] ?? 0, 2),
    );
    expect(relay({ full: true, tick: 8, balls: [] })?.grapple).toBeUndefined();
  });

  it('points a member character at its anchor until a full frame lets go', () => {
    const reaches: [number, number[] | null][] = [];
    const remote = new PlayerGrappleRemote(
      (member, anchor) => reaches.push([member, anchor?.toArray() ?? null]),
      () => {},
    );
    remote.incoming(4, { full: true, tick: 1, balls: [], grapple: playerGrappleEntry(1, new THREE.Vector3(0, 10, 5)) });
    remote.incoming(4, {
      full: false,
      tick: 2,
      balls: [],
      grapple: playerGrappleEntry(1, new THREE.Vector3(0, 10, 5)),
    });
    expect(remote.anchorOf(4)?.toArray()).toEqual([0, 10, 5]);
    remote.incoming(4, { full: false, tick: 3, balls: [] });
    expect(remote.anchorOf(4)).not.toBeNull();
    remote.incoming(4, { full: true, tick: 4, balls: [] });
    expect(remote.anchorOf(4)).toBeNull();
    remote.incoming(4, { full: true, tick: 5, balls: [] });
    expect(reaches).toEqual([
      [4, [0, 10, 5]],
      [4, null],
    ]);
  });

  it('carries a far anchor next to a near ball precisely enough', () => {
    const decoded = relay({
      full: true,
      tick: 1,
      balls: [
        { id: 1, position: [1, 2, 3], velocity: [0, 0, 0], sleeping: true, rolling: false, bounces: 0, strength: 0 },
      ],
      grapple: playerGrappleEntry(2, new THREE.Vector3(3000.3, 40.2, -2500.7)),
    });
    decoded?.grapple?.position.forEach((value, axis) =>
      expect(Math.abs(value - ([3000.3, 40.2, -2500.7][axis] ?? 0))).toBeLessThan(0.05),
    );
    decoded?.balls[0]?.position.forEach((value, axis) => expect(Math.abs(value - (axis + 1))).toBeLessThan(0.05));
  });

  it('flickers each new missed shot once, from frames that carry its end and count', () => {
    const reaches: (number[] | null)[] = [];
    const misses: [number, number[]][] = [];
    const remote = new PlayerGrappleRemote(
      (_, anchor) => reaches.push(anchor?.toArray() ?? null),
      (member, end) => misses.push([member, end.toArray().map((v) => Math.round(v * 100) / 100)]),
    );
    remote.incoming(4, { full: true, tick: 1, balls: [], grapple: playerGrappleEntry(1, new THREE.Vector3(0, 10, 5)) });
    const miss = (tick: number, count: number, z: number) => {
      const decoded = relay({
        full: tick % 2 === 0,
        tick,
        balls: [],
        grapple: playerGrappleMissEntry(1, new THREE.Vector3(0, 20, z), count),
      });
      expect(decoded?.grapple?.payload[0]).toBe(count & 0xff);
      if (decoded) remote.incoming(4, decoded);
    };
    miss(2, 1, -20);
    miss(3, 1, -20);
    miss(4, 2, -18);
    miss(5, 3, -16);
    miss(6, 3, -16);
    expect(reaches).toEqual([[0, 10, 5], null]);
    expect(misses).toEqual([
      [4, [0, 20, -20]],
      [4, [0, 20, -18]],
      [4, [0, 20, -16]],
    ]);
    expect(remote.anchorOf(4)).toBeNull();
  });
});
