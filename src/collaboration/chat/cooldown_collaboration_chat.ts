/**
 * Client copy of the relay's chat send interval: after a send (or a
 * chat_rate_limited reply) sending stays blocked until the relay would accept
 * the next message, so the Send button and Enter can be disabled up front.
 */
export class CooldownCollaborationChat {
  private intervalMs: number;
  private readyAt: number;
  private pending: boolean;

  /**
   * Creates a ready cooldown.
   *
   * @param intervalMs Shortest time between two messages.
   */
  constructor(intervalMs: number) {
    this.intervalMs = Math.max(0, intervalMs);
    this.readyAt = 0;
    this.pending = false;
  }

  /**
   * Changes the interval, e.g. after a new welcome message.
   *
   * @param intervalMs Shortest time between two messages.
   */
  intervalSet(intervalMs: number): void {
    this.intervalMs = Math.max(0, intervalMs);
  }

  /**
   * Returns how long sending stays blocked.
   *
   * @param now Current time (epoch ms).
   * @returns Milliseconds, 0 when a message may be sent.
   */
  remaining(now: number): number {
    if (this.pending) return Math.max(1, this.readyAt - now);
    return Math.max(0, this.readyAt - now);
  }

  /**
   * Returns whether a message may be sent now.
   *
   * @param now Current time (epoch ms).
   * @returns True when ready.
   */
  ready(now: number): boolean {
    return this.remaining(now) === 0;
  }

  /**
   * Returns whether a message is waiting for the relay's reply.
   *
   * @returns True while sending.
   */
  sending(): boolean {
    return this.pending;
  }

  /**
   * Blocks sending while a message is on its way, so a second Enter cannot race
   * the reply.
   */
  started(): void {
    this.pending = true;
  }

  /**
   * Starts the interval after the relay accepted a message.
   *
   * @param now Time of the acceptance (epoch ms).
   */
  accepted(now: number): void {
    this.pending = false;
    this.readyAt = now + this.intervalMs;
  }

  /**
   * Waits for the time the relay reported in chat_rate_limited.
   *
   * @param now Current time (epoch ms).
   * @param retryAfterMs Relay wait time; falls back to the full interval.
   */
  limited(now: number, retryAfterMs: unknown): void {
    this.pending = false;
    const wait = typeof retryAfterMs === 'number' && Number.isFinite(retryAfterMs) && retryAfterMs > 0;
    this.readyAt = now + Math.min(wait ? retryAfterMs : this.intervalMs, Math.max(this.intervalMs, 60000));
  }

  /** Ends a send that failed for another reason; no wait is added. */
  failed(): void {
    this.pending = false;
  }

  /** Forgets any wait, e.g. after leaving a room. */
  reset(): void {
    this.pending = false;
    this.readyAt = 0;
  }
}
