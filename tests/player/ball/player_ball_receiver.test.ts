import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PHYSICS_BALL_STEP_SECONDS } from '@/physics/ball/physics_ball_constants.js';
import { PlayerBallClock } from '@/player/ball/player_ball_clock.js';
import {
  PLAYER_BALL_EXTRAPOLATE_MAXIMUM_MS,
  PLAYER_BALL_RENDER_DELAY_MS,
} from '@/player/ball/player_ball_constants.js';
import type { PlayerBallState } from '@/player/ball/player_ball_link.js';
import { playerBallMotionPosition, type PlayerBallSample } from '@/player/ball/player_ball_motion.js';
import { PlayerBallReceiver, playerBallInterpolate } from '@/player/ball/player_ball_receiver.js';

const STEP_MS = PHYSICS_BALL_STEP_SECONDS * 1000;
const DELAY = PLAYER_BALL_RENDER_DELAY_MS;
const THROWER = 7;

/**
 * Builds a flying ball state.
 *
 * @param x Position x.
 * @param extra Fields to override.
 * @returns State.
 */
function ball(x: number, extra: Partial<PlayerBallState> = {}): PlayerBallState {
  return {
    ...{ id: 1, position: [x, 2, 0], velocity: [3, 0, 0], sleeping: false, rolling: false },
    ...{ bounces: 0, strength: 0 },
    ...extra,
  };
}

/**
 * Hands a receiver one snapshot of the thrower at a tick, arriving at a time.
 *
 * @param receiver Receiver.
 * @param tick Thrower tick.
 * @param now Arrival time.
 * @param balls Balls.
 * @param full Whether the list is complete.
 */
function receive(receiver: PlayerBallReceiver, tick: number, now: number, balls: PlayerBallState[], full = true): void {
  receiver.snapshot(THROWER, { full, tick, balls }, now);
}

/**
 * Builds a sample from a state at time 0.
 *
 * @param state Ball state.
 * @returns Sample.
 */
function sampleOf(state: PlayerBallState): PlayerBallSample {
  return {
    ...{ time: 0, position: new THREE.Vector3(...state.position), velocity: new THREE.Vector3(...state.velocity) },
    ...{ sleeping: state.sleeping, rolling: state.rolling, bounces: 0, strength: 0, bounced: false },
  };
}

describe('PlayerBallClock', () => {
  it('maps thrower ticks to the fastest delivery and keeps late snapshots at their own time', () => {
    const clock = new PlayerBallClock();
    expect(clock.timeOf(100, 1000)).toBe(1000);
    expect(clock.timeOf(112, 1000 + 12 * STEP_MS + 30)).toBeCloseTo(1000 + 12 * STEP_MS, -1);
    expect(clock.timeOf(124, 1000 + 24 * STEP_MS - 5)).toBeCloseTo(1000 + 24 * STEP_MS - 5, 6);
  });

  it('follows the 16-bit tick across its wrap', () => {
    const clock = new PlayerBallClock();
    clock.timeOf(0xfff0, 0);
    expect(clock.timeOf(0x0010, 0x20 * STEP_MS)).toBeCloseTo(0x20 * STEP_MS, 6);
  });
});

describe('playerBallMotion', () => {
  it('holds resting balls, slows rolling ones along the surface and arcs flying ones', () => {
    const target = new THREE.Vector3();
    expect(playerBallMotionPosition(sampleOf(ball(0, { sleeping: true })), 1, target).toArray()).toEqual([0, 2, 0]);
    const rolled = playerBallMotionPosition(sampleOf(ball(0, { rolling: true })), 1, target).clone();
    expect(rolled.y).toBe(2);
    expect(rolled.x).toBeGreaterThan(2);
    expect(rolled.x).toBeLessThan(3);
    const flown = playerBallMotionPosition(sampleOf(ball(0)), 0.5, target);
    expect(flown.x).toBeCloseTo(1.5, 6);
    expect(flown.y).toBeCloseTo(2 - 0.5 * 9.81 * 0.25, 6);
  });
});

describe('PlayerBallReceiver', () => {
  it('draws remote balls in the past, along the arc and meeting the next snapshot', () => {
    const receiver = new PlayerBallReceiver();
    receive(receiver, 0, 1000, [ball(0)]);
    expect(receiver.frame(1000 + DELAY - 1).balls).toEqual([]);
    receive(receiver, 24, 1000 + 24 * STEP_MS, [ball(0.7, { velocity: [3, -2, 0] })]);
    const start = receiver.frame(1000 + DELAY).balls[0];
    expect(start?.position.toArray()).toEqual([0, 2, 0]);
    expect(start?.key).toBe(`${THROWER}:1`);
    const end = receiver.frame(1000 + DELAY + 24 * STEP_MS).balls[0];
    expect(end?.position.x).toBeCloseTo(0.7, 6);
    expect(end?.position.y).toBeCloseTo(2, 6);
  });

  it('extrapolates past the newest snapshot only for a short while', () => {
    const receiver = new PlayerBallReceiver();
    receive(receiver, 0, 0, [ball(0, { rolling: true, velocity: [1, 0, 0] })]);
    const far = receiver.frame(DELAY + 5000).balls[0];
    const limit = receiver.frame(DELAY + PLAYER_BALL_EXTRAPOLATE_MAXIMUM_MS).balls[0];
    expect(far?.position.x).toBeCloseTo(limit?.position.x ?? 0, 6);
    expect(far?.position.x).toBeGreaterThan(0);
  });

  it('plays a bounce when the drawn time passes a snapshot whose counter moved, also across the wrap', () => {
    const receiver = new PlayerBallReceiver();
    receive(receiver, 0, 0, [ball(0, { bounces: 15 })]);
    receive(receiver, 12, 12 * STEP_MS, [ball(0.3, { bounces: 0, strength: 6 })], false);
    receive(receiver, 24, 24 * STEP_MS, [ball(0.6, { bounces: 0, strength: 6 })], false);
    expect(receiver.frame(DELAY + 12 * STEP_MS - 1).impacts).toEqual([]);
    const impacts = receiver.frame(DELAY + 12 * STEP_MS).impacts;
    expect(impacts.map((impact) => [impact.speed, impact.position.x])).toEqual([[6, 0.3]]);
    expect(receiver.frame(DELAY + 30 * STEP_MS).impacts).toEqual([]);
  });

  it('removes a ball a full snapshot leaves out once the drawn time reaches that snapshot', () => {
    const receiver = new PlayerBallReceiver();
    receive(receiver, 0, 0, [ball(0), ball(1, { id: 2 })]);
    receive(receiver, 24, 24 * STEP_MS, [ball(1, { id: 2 })]);
    expect(receiver.frame(DELAY + 24 * STEP_MS - 1).balls).toHaveLength(2);
    expect(receiver.frame(DELAY + 24 * STEP_MS).balls.map((shown) => shown.key)).toEqual([`${THROWER}:2`]);
    receive(receiver, 48, 48 * STEP_MS, []);
    expect(receiver.frame(DELAY + 48 * STEP_MS).balls).toEqual([]);
  });

  it('is settled once every ball rests and its last snapshot was drawn', () => {
    const receiver = new PlayerBallReceiver();
    expect(receiver.isSettled(0)).toBe(true);
    receive(receiver, 0, 0, [ball(0, { sleeping: true })]);
    expect(receiver.isSettled(DELAY - 1)).toBe(false);
    expect(receiver.isSettled(DELAY)).toBe(true);
    receiver.keepMembers((member) => member !== THROWER);
    expect(receiver.frame(DELAY).balls).toEqual([]);
  });
});

describe('snapshot interpolation', () => {
  /**
   * Builds a sample at a time.
   *
   * @param time Local time.
   * @param position Position.
   * @param velocity Velocity.
   * @returns Sample.
   */
  function at(time: number, position: number[], velocity: number[]): PlayerBallSample {
    return {
      ...sampleOf(ball(0)),
      time,
      position: new THREE.Vector3(...position),
      velocity: new THREE.Vector3(...velocity),
    };
  }

  it('follows a flight arc exactly between two snapshots (cubic Hermite with the sent velocities)', () => {
    const fly = sampleOf(ball(0, { velocity: [4, 5, 0] }));
    const end = playerBallMotionPosition(fly, 0.2, new THREE.Vector3());
    const endVelocity = [4, 5 - 9.81 * 0.2, 0];
    const from = at(0, fly.position.toArray(), [4, 5, 0]);
    const to = at(200, end.toArray(), endVelocity);
    for (const time of [50, 100, 150]) {
      const truth = playerBallMotionPosition(fly, time / 1000, new THREE.Vector3());
      expect(playerBallInterpolate(from, to, time).position.distanceTo(truth)).toBeLessThan(1e-6);
    }
  });

  it('joins snapshots around a bounce with a straight line instead of overshooting', () => {
    const from = at(0, [0, 0.5, 0], [2, -6, 0]);
    const to = at(200, [0.4, 0.3, 0], [2, 5, 0]);
    const middle = playerBallInterpolate(from, to, 100).position;
    expect(middle.x).toBeCloseTo(0.2, 6);
    expect(middle.y).toBeCloseTo(0.4, 6);
  });

  it('extrapolates at most 100 ms when snapshots run dry, then blends into the next one instead of jumping', () => {
    const receiver = new PlayerBallReceiver();
    receive(receiver, 0, 0, [ball(0)]);
    const capped = receiver.frame(DELAY + 500).balls[0]?.position.x ?? NaN;
    expect(capped).toBeCloseTo(3 * (PLAYER_BALL_EXTRAPOLATE_MAXIMUM_MS / 1000), 6);
    // The next snapshot says the ball was pushed back; the drawn ball eases over.
    receive(receiver, Math.round(400 / STEP_MS), 520, [ball(-0.5, { velocity: [-3, 0, 0] })], false);
    const next = receiver.frame(DELAY + 516).balls[0]?.position.x ?? NaN;
    expect(Math.abs(next - capped)).toBeLessThan(0.05);
    const later = receiver.frame(DELAY + 1500).balls[0]?.position.x ?? NaN;
    expect(later).toBeLessThan(-0.5);
  });

  it('snaps when the error is large', () => {
    const receiver = new PlayerBallReceiver();
    receive(receiver, 0, 0, [ball(0)]);
    receiver.frame(DELAY + 500);
    receive(receiver, Math.round(400 / STEP_MS), 520, [ball(-10, { velocity: [0, 0, 0] })], false);
    const x = receiver.frame(DELAY + 600).balls[0]?.position.x ?? NaN;
    expect(x).toBeLessThan(-9);
  });
});
