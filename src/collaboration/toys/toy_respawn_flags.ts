import type { PlayerBallState } from '@/player/ball/player_ball_link.js';

/**
 * How long a toy's respawn flag stays set after it respawned, in milliseconds:
 * a few snapshots (one per 200 ms while it moves), so a receiver whose mailbox
 * dropped some of them still sees the flag, yet well below the time four throws
 * take to bring the same id round again.
 */
export const TOY_RESPAWN_FLAG_MS = 600;

/**
 * Turns spawn counts into the header's respawn flags and back. The sender sets
 * a toy's flag for TOY_RESPAWN_FLAG_MS after its spawn count changed; a
 * receiver counts a new life whenever the flag of an id turns on (it was off in
 * the sender's previous frame it got), so it starts that toy afresh instead of
 * interpolating from its previous life.
 */
export class ToyRespawnFlags {
  private readonly sent: Map<number, { spawn: number; at: number }>;
  private readonly heard: Map<number, { flags: number; lives: number[] }>;

  /** Starts with nothing sent or heard. */
  constructor() {
    this.sent = new Map();
    this.heard = new Map();
  }

  /**
   * Returns the respawn flags of an outgoing snapshot.
   *
   * @param balls Listed own balls.
   * @param now Current time in milliseconds.
   * @returns Flags, bit n for toy id n + 1.
   */
  outgoing(balls: readonly PlayerBallState[], now: number): number {
    for (const ball of balls) {
      const spawn = ball.spawn ?? 0;
      if (this.sent.get(ball.id)?.spawn !== spawn) this.sent.set(ball.id, { spawn, at: now });
    }
    let flags = 0;
    this.sent.forEach((sent, id) => {
      if (now - sent.at < TOY_RESPAWN_FLAG_MS) flags |= 1 << (id - 1);
    });
    return flags;
  }

  /**
   * Gives a received sender's balls their life counts from the respawn flags.
   *
   * @param sender Sender id.
   * @param flags Respawn flags of its frame.
   * @param balls Its decoded balls, changed in place.
   */
  incoming(sender: number, flags: number, balls: PlayerBallState[]): void {
    const heard = this.heard.get(sender) ?? { flags: 0, lives: [0, 0, 0, 0] };
    heard.lives = heard.lives.map((lives, index) => lives + (((flags & ~heard.flags) >> index) & 1));
    heard.flags = flags;
    this.heard.set(sender, heard);
    balls.forEach((ball) => (ball.spawn = heard.lives[ball.id - 1] ?? 0));
  }

  /**
   * Forgets a member that left.
   *
   * @param sender Member id.
   */
  forget(sender: number): void {
    this.heard.delete(sender);
  }
}
