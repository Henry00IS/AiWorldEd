import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PlayerBallAuthority } from '@/player/ball/player_ball_authority.js';
import {
  PLAYER_BALL_FRAME_INTERVAL_MS,
  PLAYER_BALL_FULL_INTERVAL_MS,
  PLAYER_BALL_KEEPALIVE_MS,
} from '@/player/ball/player_ball_constants.js';
import type { PlayerBallSnapshot } from '@/player/ball/player_ball_link.js';
import { PlayerBallPublisher } from '@/player/ball/player_ball_publisher.js';

/**
 * Throws an own ball at the origin.
 *
 * @param authority Own balls.
 */
function spawn(authority: PlayerBallAuthority): void {
  authority.spawn(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0));
}

/**
 * Asks for the snapshot due at a time and marks it sent.
 *
 * @param publisher Publisher.
 * @param authority Simulation.
 * @param now Time in milliseconds.
 * @returns Snapshot, or null.
 */
function send(publisher: PlayerBallPublisher, authority: PlayerBallAuthority, now: number): PlayerBallSnapshot | null {
  publisher.note(authority.takeChanges());
  const snapshot = publisher.next(authority, now);
  if (snapshot) publisher.mark(snapshot, authority.isAwake(), now);
  return snapshot;
}

/**
 * Describes a snapshot as full flag and listed ball ids.
 *
 * @param snapshot Snapshot or null.
 * @returns Summary, or null.
 */
function summary(snapshot: PlayerBallSnapshot | null): [boolean, number[]] | null {
  return snapshot ? [snapshot.full, snapshot.balls.map((ball) => ball.id)] : null;
}

describe('PlayerBallPublisher', () => {
  it('sends changes at most every 200 ms, moving balls every 500 ms and everything every 2 s', () => {
    const authority = new PlayerBallAuthority();
    const publisher = new PlayerBallPublisher();
    spawn(authority);
    expect(summary(send(publisher, authority, 0))).toEqual([true, [1]]);
    spawn(authority);
    expect(send(publisher, authority, PLAYER_BALL_FRAME_INTERVAL_MS - 1)).toBeNull();
    expect(summary(send(publisher, authority, PLAYER_BALL_FRAME_INTERVAL_MS))).toEqual([false, [2]]);
    expect(send(publisher, authority, PLAYER_BALL_FRAME_INTERVAL_MS + PLAYER_BALL_KEEPALIVE_MS - 1)).toBeNull();
    const keepalive = send(publisher, authority, PLAYER_BALL_FRAME_INTERVAL_MS + PLAYER_BALL_KEEPALIVE_MS);
    expect(summary(keepalive)).toEqual([false, [1, 2]]);
    expect(summary(send(publisher, authority, PLAYER_BALL_FULL_INTERVAL_MS))).toEqual([true, [1, 2]]);
  });

  it('sends everything once a ball disappears', () => {
    const authority = new PlayerBallAuthority();
    const publisher = new PlayerBallPublisher();
    spawn(authority);
    spawn(authority);
    send(publisher, authority, 0);
    authority.removeWhere((body) => body.id === 1);
    expect(summary(send(publisher, authority, 300))).toEqual([true, [2]]);
    authority.removeWhere((body) => body.id === 2);
    expect(summary(send(publisher, authority, 600))).toEqual([true, []]);
    expect(publisher.isOwing()).toBe(false);
  });

  it('sends everything once all balls rest and then stays silent', () => {
    const authority = new PlayerBallAuthority();
    const publisher = new PlayerBallPublisher();
    spawn(authority);
    send(publisher, authority, 0);
    authority.getBodies().forEach((body) => body.ball.rest());
    expect(summary(send(publisher, authority, 300))).toEqual([true, [1]]);
    expect(publisher.isOwing()).toBe(false);
    for (let now = 400; now < 20_000; now += 100) expect(send(publisher, authority, now)).toBeNull();
  });

  it('sends resting balls once more, at the next allowed slot, when asked for a full list', () => {
    const authority = new PlayerBallAuthority();
    const publisher = new PlayerBallPublisher();
    spawn(authority);
    authority.getBodies().forEach((body) => body.ball.rest());
    expect(summary(send(publisher, authority, 0))).toEqual([true, [1]]);
    expect(send(publisher, authority, 10_000)).toBeNull();
    publisher.requestFull();
    expect(publisher.isOwing()).toBe(true);
    expect(summary(send(publisher, authority, 10_100))).toEqual([true, [1]]);
    publisher.requestFull();
    expect(send(publisher, authority, 10_100 + PLAYER_BALL_FRAME_INTERVAL_MS - 1)).toBeNull();
    expect(summary(send(publisher, authority, 10_100 + PLAYER_BALL_FRAME_INTERVAL_MS))).toEqual([true, [1]]);
    expect(send(publisher, authority, 60_000)).toBeNull();
  });

  it('retries a snapshot the link refused', () => {
    const authority = new PlayerBallAuthority();
    const publisher = new PlayerBallPublisher();
    spawn(authority);
    publisher.note(authority.takeChanges());
    expect(publisher.next(authority, 0)).not.toBeNull();
    expect(summary(publisher.next(authority, 16))).toEqual([true, [1]]);
  });
});
