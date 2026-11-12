import type { PlayerBallAuthority, PlayerBallChanges } from './player_ball_authority.js';
import {
  PLAYER_BALL_FRAME_INTERVAL_MS,
  PLAYER_BALL_FULL_INTERVAL_MS,
  PLAYER_BALL_KEEPALIVE_MS,
} from './player_ball_constants.js';
import type { PlayerBallSnapshot } from './player_ball_link.js';

/**
 * Decides what the thrower sends about its own balls. Receivers draw each ball
 * along its arc between snapshots, so a snapshot is only needed for what they
 * cannot predict:
 *
 * - The balls that changed (spawned, touched by a player or another ball, woken
 *   up or put to rest), at most every 200 ms.
 * - While anything moves and nothing else was sent for 500 ms, the moving balls
 *   (keepalive), and every 2 s all balls, for lost frames (the relay keeps only
 *   the newest frame).
 * - A full list right after a ball disappears and once everything rests, so the
 *   relay's latest full snapshot is exact while the room is quiet.
 * - A full list when a new member joins (at the next allowed slot), so it sees
 *   balls that rest.
 * - Nothing else while every ball rests: there is no resting heartbeat.
 *
 * A snapshot the link refuses (busy with edits) is retried on a later frame.
 */
export class PlayerBallPublisher {
  private readonly pending: Set<string>;
  private sentAt: number;
  private fullAt: number;
  private needsFull: boolean;
  private quiet: boolean;

  /** Creates a publisher that owes nothing. */
  constructor() {
    this.pending = new Set();
    this.sentAt = Number.NEGATIVE_INFINITY;
    this.fullAt = Number.NEGATIVE_INFINITY;
    this.needsFull = false;
    this.quiet = true;
  }

  /**
   * Notes what changed in the simulation.
   *
   * @param changes Changed balls and removals.
   */
  note(changes: PlayerBallChanges): void {
    changes.keys.forEach((key) => this.pending.add(key));
    this.needsFull ||= changes.removed;
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
    if (now - this.sentAt < PLAYER_BALL_FRAME_INTERVAL_MS) return null;
    const awake = authority.isAwake();
    const tick = authority.getTick();
    const refresh = awake && now - this.fullAt >= PLAYER_BALL_FULL_INTERVAL_MS;
    if (this.needsFull || refresh || (!awake && !this.quiet)) {
      return { full: true, tick, balls: authority.states() };
    }
    const changed = authority.states((body) => this.pending.has(body.key));
    if (changed.length > 0) return { full: false, tick, balls: changed };
    if (awake && now - this.sentAt >= PLAYER_BALL_KEEPALIVE_MS) {
      return { full: false, tick, balls: authority.states((body) => !body.ball.isResting) };
    }
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
    this.sentAt = now;
    this.pending.clear();
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
    return this.pending.size > 0 || this.needsFull || !this.quiet;
  }

  /** Forgets everything (leaving the room). */
  reset(): void {
    this.pending.clear();
    this.sentAt = Number.NEGATIVE_INFINITY;
    this.fullAt = Number.NEGATIVE_INFINITY;
    this.needsFull = false;
    this.quiet = true;
  }
}
