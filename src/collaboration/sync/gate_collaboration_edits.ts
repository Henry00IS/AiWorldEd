/**
 * One-shot edit messages per second the client sends at most; below the relay's
 * per-member limit (20/s), so honest bursts are queued here instead of being
 * rejected there.
 */
export const GATE_COLLABORATION_RATE = 15;
/** One-shot edit messages the client may send at once (relay burst: 60). */
export const GATE_COLLABORATION_BURST = 40;
/** Created plus deleted ids per second (relay: 10000). */
export const GATE_COLLABORATION_BULK_RATE = 8000;
/** Created plus deleted ids at once (relay burst: 250000). */
export const GATE_COLLABORATION_BULK_BURST = 200_000;

/** Message waiting for tokens. */
interface GateCollaborationItem {
  message: object;
  cost: number;
  bulk: number;
}

/**
 * Client-side pacing of edit messages: a token bucket per kind of cost in front
 * of the socket. Messages leave in order; once one waits, every later message
 * (lease control included) queues behind it so the relay sees them in the order
 * they were made.
 */
export class GateCollaborationEdits {
  private readonly sendNow: (message: object) => void;
  private readonly clock: () => number;
  private readonly queue: GateCollaborationItem[];
  private tokens: number;
  private bulkTokens: number;
  private refilledAt: number;
  private timer: ReturnType<typeof setTimeout> | null;

  /**
   * Creates a gate.
   *
   * @param sendNow Sends a message on the socket.
   * @param clock Monotonic clock in milliseconds.
   */
  constructor(sendNow: (message: object) => void, clock: () => number) {
    this.sendNow = sendNow;
    this.clock = clock;
    this.queue = [];
    this.tokens = GATE_COLLABORATION_BURST;
    this.bulkTokens = GATE_COLLABORATION_BULK_BURST;
    this.refilledAt = clock();
    this.timer = null;
  }

  /**
   * Returns whether messages are waiting.
   *
   * @returns True while the queue is not empty.
   */
  busy(): boolean {
    return this.queue.length > 0;
  }

  /**
   * Sends or queues a message.
   *
   * @param message Message.
   * @param cost One-shot tokens it takes (0 for live previews and lease
   *   control).
   * @param bulk Created plus deleted ids it carries.
   */
  send(message: object, cost: number, bulk: number = 0): void {
    this.queue.push({ message, cost, bulk });
    this.flush();
  }

  /** Drops everything queued (left the room). */
  clear(): void {
    this.queue.length = 0;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Sends what the buckets allow and schedules the rest. */
  private flush(): void {
    this.refill();
    while (this.queue.length > 0) {
      const item = this.queue[0] as GateCollaborationItem;
      const bulk = Math.min(item.bulk, GATE_COLLABORATION_BULK_BURST);
      if (this.tokens < item.cost || this.bulkTokens < bulk) break;
      this.tokens -= item.cost;
      this.bulkTokens -= bulk;
      this.queue.shift();
      this.sendNow(item.message);
    }
    if (this.queue.length > 0 && this.timer === null) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.flush();
      }, 1000 / GATE_COLLABORATION_RATE);
    }
  }

  /** Adds the tokens earned since the last refill. */
  private refill(): void {
    const now = this.clock();
    const seconds = Math.max(0, now - this.refilledAt) / 1000;
    this.refilledAt = now;
    this.tokens = Math.min(GATE_COLLABORATION_BURST, this.tokens + seconds * GATE_COLLABORATION_RATE);
    this.bulkTokens = Math.min(GATE_COLLABORATION_BULK_BURST, this.bulkTokens + seconds * GATE_COLLABORATION_BULK_RATE);
  }
}
