import type { PlayerBallAuthority, PlayerBallChanges } from './player_ball_authority.js';
import {
  PLAYER_BALL_BOUNCE_GAP_MS,
  PLAYER_BALL_FRAME_INTERVAL_MS,
  PLAYER_BALL_FULL_INTERVAL_MS,
  PLAYER_BALL_SEND_BURST,
  PLAYER_BALL_SEND_PER_SECOND,
} from './player_ball_constants.js';
import type { PlayerBallSnapshot } from './player_ball_link.js';

/**
 * Decides what the thrower sends about its own balls. Receivers interpolate
 * between snapshots (they draw the past), so moving balls are sampled at a
 * steady rate:
 *
 * - While anything moves, the moving and changed balls every 200 ms, and every 2
 *   s all balls, for lost frames (the relay keeps only the newest frame).
 * - Right after a bounce one extra snapshot, so receivers have a real sample on
 *   both sides of it.
 * - The balls that changed (spawned, touched, woken up or put to rest).
 * - A full list right after a ball disappears and once everything rests, so the
 *   relay's latest full snapshot is exact while the room is quiet.
 * - A full list when a new member joins, so it sees balls that rest.
 * - Nothing else while every ball rests: there is no resting heartbeat.
 *
 * Every snapshot spends a token of a bucket below the relay's toy limit (5 per
 * second, burst 10); without a token it waits. A snapshot the link refuses
 * (busy with edits) is retried on a later frame.
 */
export class PlayerBallPublisher {
  private readonly pending: Set<string>;
  private sentAt: number;
  private fullAt: number;
  private needsFull: boolean;
  private quiet: boolean;
  private bounced: boolean;
  private tokens: number;
  private tokensAt: number;

  /** Creates a publisher that owes nothing. */
  constructor() {
    this.pending = new Set();
    this.sentAt = Number.NEGATIVE_INFINITY;
    this.fullAt = Number.NEGATIVE_INFINITY;
    this.needsFull = false;
    this.quiet = true;
    this.bounced = false;
    this.tokens = PLAYER_BALL_SEND_BURST;
    this.tokensAt = Number.NEGATIVE_INFINITY;
  }

  /**
   * Notes what changed in the simulation.
   *
   * @param changes Changed balls, removals and bounces.
   */
  note(changes: PlayerBallChanges): void {
    changes.keys.forEach((key) => this.pending.add(key));
    this.needsFull ||= changes.removed;
    this.bounced ||= changes.bounced;
    if (changes.keys.size > 0 || changes.removed) this.quiet = false;
  }

  /** Owes a full list at the next allowed slot (a member joined). */
  requestFull(): void {
    this.needsFull = true;
  }

  /**
   * Builds the snapshot due now, if any.
   *
   * @param authority Simulation.
   * @param now Current time in milliseconds.
   * @returns Snapshot to send, or null.
   */
  next(authority: PlayerBallAuthority, now: number): PlayerBallSnapshot | null {
    this.refill(now);
    if (this.tokens < 1) return null;
    const since = now - this.sentAt;
    const bounce = this.bounced && since >= PLAYER_BALL_BOUNCE_GAP_MS;
    if (since < PLAYER_BALL_FRAME_INTERVAL_MS && !bounce) return null;
    const awake = authority.isAwake();
    const tick = authority.getTick();
    const refresh = awake && now - this.fullAt >= PLAYER_BALL_FULL_INTERVAL_MS;
    if (this.needsFull || refresh || (!awake && !this.quiet)) {
      return { full: true, tick, balls: authority.states() };
    }
    const balls = authority.states((body) => this.pending.has(body.key) || !body.ball.isResting);
    if (balls.length > 0) return { full: false, tick, balls };
    this.bounced = false;
    return null;
  }

  /**
   * Records a snapshot that went out.
   *
   * @param snapshot Sent snapshot.
   * @param awake Whether any ball still moves.
   * @param now Current time in milliseconds.
   */
  mark(snapshot: PlayerBallSnapshot, awake: boolean, now: number): void {
    this.refill(now);
    this.tokens -= 1;
    this.sentAt = now;
    this.pending.clear();
    this.bounced = false;
    if (!snapshot.full) return;
    this.fullAt = now;
    this.needsFull = false;
    this.quiet = !awake;
  }

  /**
   * Tells whether something is still owed to the other members.
   *
   * @returns True until the quiet state was sent.
   */
  isOwing(): boolean {
    return this.pending.size > 0 || this.needsFull || this.bounced || !this.quiet;
  }

  /** Forgets everything (leaving the room). */
  reset(): void {
    this.pending.clear();
    this.sentAt = Number.NEGATIVE_INFINITY;
    this.fullAt = Number.NEGATIVE_INFINITY;
    this.needsFull = false;
    this.quiet = true;
    this.bounced = false;
    this.tokens = PLAYER_BALL_SEND_BURST;
    this.tokensAt = Number.NEGATIVE_INFINITY;
  }

  /**
   * Adds the tokens earned since the last refill.
   *
   * @param now Current time in milliseconds.
   */
  private refill(now: number): void {
    if (Number.isFinite(this.tokensAt)) {
      const earned = ((now - this.tokensAt) / 1000) * PLAYER_BALL_SEND_PER_SECOND;
      this.tokens = Math.min(PLAYER_BALL_SEND_BURST, this.tokens + Math.max(0, earned));
    }
    this.tokensAt = now;
  }
}
