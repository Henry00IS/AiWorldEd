import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  PLAYER_BALL_CARRY_FADE_SECONDS,
  PLAYER_BALL_CARRY_HOLD_SECONDS,
  PlayerBallCarry,
} from '@/player/ball/player_ball_carry.js';

const RUN = new THREE.Vector3(0, 0, 7);
const STILL = new THREE.Vector3();

/**
 * Returns the carried speed after running and stopping at time 1.
 *
 * @param after Seconds after the stop.
 * @param step Frame time in seconds.
 * @returns Speed.
 */
function carriedAfterStop(after: number, step: number): number {
  const carry = new PlayerBallCarry();
  for (let t = 0; t < 1; t += step) carry.record(RUN, t);
  for (let t = 1; t <= 1 + after; t += step) carry.record(STILL, t);
  return carry.at(1 + after, new THREE.Vector3()).length();
}

describe('PlayerBallCarry', () => {
  it('keeps the run in full for a moment after stopping, then fades it out', () => {
    expect(carriedAfterStop(0.1, 1 / 60)).toBeCloseTo(7, 5);
    expect(carriedAfterStop(0.26, 1 / 60)).toBeGreaterThan(1);
    expect(carriedAfterStop(0.26, 1 / 60)).toBeLessThan(6);
    expect(carriedAfterStop(0.5, 1 / 60)).toBe(0);
  });

  it('does not depend on the frame rate', () => {
    for (const after of [0.1, 0.2, 0.25, 0.3, 0.4]) {
      expect(carriedAfterStop(after, 1 / 30)).toBeCloseTo(carriedAfterStop(after, 1 / 144), 0);
    }
  });

  it('follows the current velocity once it is faster, with its direction, and forgets on reset', () => {
    const carry = new PlayerBallCarry();
    carry.record(RUN, 0);
    carry.record(new THREE.Vector3(3, 0, 0), 0.1);
    expect(carry.at(0.1, new THREE.Vector3()).z).toBe(7);
    carry.record(new THREE.Vector3(3, 0, 0), PLAYER_BALL_CARRY_FADE_SECONDS);
    expect(carry.at(PLAYER_BALL_CARRY_FADE_SECONDS, new THREE.Vector3())).toEqual(new THREE.Vector3(3, 0, 0));
    carry.reset();
    expect(carry.at(PLAYER_BALL_CARRY_HOLD_SECONDS, new THREE.Vector3()).length()).toBe(0);
  });
});
