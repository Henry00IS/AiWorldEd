import { customFrameParse } from '@/collaboration/shared/custom_frame.js';

/** One queued application frame, with reply timeout started only after sending. */
interface CustomQueuedFrame {
  frame: Uint8Array;
  sent: () => void;
}
/** One accepted send in the exact rolling budget. */
interface CustomSentFrame {
  at: number;
  bytes: number;
}

/**
 * Separate bounded custom FIFO. Ready edits take priority; custom FIFO order is
 * preserved.
 */
export class OutboxCollaborationCustom {
  private readonly queue: CustomQueuedFrame[] = [];
  private readonly window: CustomSentFrame[] = [];
  private queuedBytes = 0;
  private windowBytes = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Creates a custom-only sender.
   *
   * @param send Writes an already-paced frame to the socket.
   * @param idle Whether normal edit/control traffic has drained.
   * @param clock Monotonic milliseconds, injectable for deterministic tests.
   */
  constructor(
    private readonly send: (frame: Uint8Array) => void,
    private readonly idle: () => boolean,
    private readonly clock: () => number = () => performance.now(),
  ) {}

  /**
   * Queues one frame, without charging the edit/control bucket.
   *
   * @param frame Owned binary frame.
   * @param sent Called when its relay response timeout may start.
   */
  enqueue(frame: Uint8Array, sent: () => void = () => undefined): void {
    if ((customFrameParse(frame)?.payload.length ?? frame.byteLength) > 256 * 1024)
      throw new Error('Custom payload exceeds 256 KiB');
    if (this.queuedBytes + frame.byteLength > 16 * 1024 * 1024) throw new Error('Custom send queue exceeds 16 MiB');
    this.queue.push({ frame, sent });
    this.queuedBytes += frame.byteLength;
    this.schedule(0);
  }

  /** Cancels pending sends and forgets this connection's rate history. */
  clear(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.queue.length = 0;
    this.window.length = 0;
    this.queuedBytes = 0;
    this.windowBytes = 0;
  }

  /**
   * Schedules one bounded flush task.
   *
   * @param delay Delay in milliseconds.
   */
  private schedule(delay: number): void {
    if (this.timer === null) this.timer = setTimeout(() => this.flush(), delay);
  }

  /** Sends at most 64 frames per task, yielding to UI edits between tasks. */
  private flush(): void {
    this.timer = null;
    for (let count = 0; count < 64 && this.queue.length; count++) {
      if (!this.idle()) return this.schedule(4);
      const next = this.queue[0];
      if (!next) return;
      const bytes = Math.max(1, customFrameParse(next.frame)?.payload.length ?? next.frame.byteLength);
      const wait = this.wait(bytes);
      if (wait > 0) return this.schedule(wait);
      this.queue.shift();
      this.queuedBytes -= next.frame.byteLength;
      this.window.push({ at: this.clock(), bytes });
      this.windowBytes += bytes;
      next.sent();
      this.send(next.frame);
    }
    if (this.queue.length) this.schedule(0);
  }

  /**
   * Computes sliding-window delay, with a small guard against clock/timer
   * rounding.
   *
   * @param bytes Payload bytes, zero-length frames cost one.
   * @returns Milliseconds until the next frame fits.
   */
  private wait(bytes: number): number {
    const now = this.clock();
    while (this.window[0] && this.window[0].at <= now - 1001) this.windowBytes -= this.window.shift()?.bytes ?? 0;
    if (this.windowBytes + bytes <= 256 * 1024 && this.window.length < 4096) return 0;
    return Math.max(1, Math.ceil((this.window[0]?.at ?? now) + 1001 - now));
  }
}
