import { PHYSICS_BALL_STEP_SECONDS } from '@/physics/ball/physics_ball_constants.js';
import { PLAYER_BALL_CLOCK_DRIFT_STEPS_PER_SECOND } from './player_ball_constants.js';

/** Milliseconds per simulation step. */
const PLAYER_BALL_CLOCK_STEP_MS = PHYSICS_BALL_STEP_SECONDS * 1000;
/** Range of the wrapping thrower tick. */
const PLAYER_BALL_CLOCK_TICK_RANGE = 0x10000;

/**
 * Places one thrower's snapshots on this client's timeline. The offset between
 * local time and the thrower's tick is the smallest one seen (the fastest
 * delivery), allowed to grow slowly so a lasting slowdown is followed. A
 * snapshot that arrives late still gets the time it was taken at, so jitter
 * does not show as stutter.
 */
export class PlayerBallClock {
  private offset: number | null;
  private tick: number;
  private seenAt: number;

  /** Creates a clock that has seen nothing. */
  constructor() {
    this.offset = null;
    this.tick = 0;
    this.seenAt = 0;
  }

  /**
   * Notes a snapshot and returns the local time its state belongs to.
   *
   * @param tick Wrapping 16-bit thrower tick.
   * @param now Arrival time in milliseconds.
   * @returns Local time of the tick in milliseconds.
   */
  timeOf(tick: number, now: number): number {
    this.tick = this.offset === null ? tick : this.unwrap(tick);
    const sample = now - this.tick * PLAYER_BALL_CLOCK_STEP_MS;
    const drift = (now - this.seenAt) * PLAYER_BALL_CLOCK_DRIFT_STEPS_PER_SECOND * PHYSICS_BALL_STEP_SECONDS;
    this.offset = this.offset === null ? sample : Math.min(this.offset + drift, sample);
    this.seenAt = now;
    return this.tick * PLAYER_BALL_CLOCK_STEP_MS + this.offset;
  }

  /**
   * Extends a wrapping 16-bit tick to the one nearest the last seen.
   *
   * @param tick Wrapping tick.
   * @returns Unwrapped tick.
   */
  private unwrap(tick: number): number {
    const half = PLAYER_BALL_CLOCK_TICK_RANGE / 2;
    const difference =
      ((((tick - this.tick + half) % PLAYER_BALL_CLOCK_TICK_RANGE) + PLAYER_BALL_CLOCK_TICK_RANGE) %
        PLAYER_BALL_CLOCK_TICK_RANGE) -
      half;
    return this.tick + difference;
  }
}
