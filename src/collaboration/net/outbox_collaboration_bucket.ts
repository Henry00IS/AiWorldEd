/** Monotonic clock in milliseconds. */
export type OutboxCollaborationClock = () => number;

/**
 * Client-side token bucket that keeps outgoing traffic below the relay's
 * per-connection message and byte limits.
 */
export class OutboxCollaborationBucket {
  private readonly rate: number;
  private readonly burst: number;
  private readonly byteRate: number;
  private readonly byteBurst: number;
  private readonly clock: OutboxCollaborationClock;
  private tokens: number;
  private bytes: number;
  private stamp: number;

  /**
   * Creates a full bucket.
   *
   * @param rate Messages refilled per second.
   * @param burst Message capacity.
   * @param byteRate Bytes refilled per second.
   * @param byteBurst Byte capacity.
   * @param clock Millisecond clock.
   */
  constructor(rate: number, burst: number, byteRate: number, byteBurst: number, clock: OutboxCollaborationClock) {
    this.rate = rate;
    this.burst = burst;
    this.byteRate = byteRate;
    this.byteBurst = byteBurst;
    this.clock = clock;
    this.tokens = burst;
    this.bytes = byteBurst;
    this.stamp = clock();
  }

  /**
   * Takes one message of a given size when the budget allows it.
   *
   * @param size Message size in bytes.
   * @returns True when the message may be sent now.
   */
  take(size: number): boolean {
    this.refill();
    const cost = Math.min(size, this.byteBurst);
    if (this.tokens < 1 || this.bytes < cost) return false;
    this.tokens -= 1;
    this.bytes -= cost;
    return true;
  }

  /**
   * Returns how long to wait before a message of a given size fits.
   *
   * @param size Message size in bytes.
   * @returns Delay in milliseconds.
   */
  waitMs(size: number): number {
    this.refill();
    const cost = Math.min(size, this.byteBurst);
    const messageWait = this.tokens >= 1 ? 0 : ((1 - this.tokens) / this.rate) * 1000;
    const byteWait = this.bytes >= cost ? 0 : ((cost - this.bytes) / this.byteRate) * 1000;
    return Math.ceil(Math.max(messageWait, byteWait, 1));
  }

  /** Adds tokens for the time elapsed since the last call. */
  private refill(): void {
    const now = this.clock();
    const seconds = Math.max(0, now - this.stamp) / 1000;
    this.stamp = now;
    this.tokens = Math.min(this.burst, this.tokens + seconds * this.rate);
    this.bytes = Math.min(this.byteBurst, this.bytes + seconds * this.byteRate);
  }
}
