import type { DiscordRichPresenceClock } from '@/desktop/discord/discord_rich_presence_clock.js';

/** One scheduled fake-clock timer. */
interface DiscordRichPresenceFakeTimer {
  id: number;
  at: number;
  callback: () => void;
}

/** Deterministic clock that queues timeouts until time is advanced. */
export class DiscordRichPresenceClockFake implements DiscordRichPresenceClock {
  private currentMs: number;
  private nextId: number;
  private readonly timers: DiscordRichPresenceFakeTimer[];

  /**
   * Creates a clock starting at the given time.
   *
   * @param startMs Initial now() value.
   */
  constructor(startMs: number = 1_000) {
    this.currentMs = startMs;
    this.nextId = 1;
    this.timers = [];
  }

  /**
   * Returns the current fake time.
   *
   * @returns Time in milliseconds.
   */
  now(): number {
    return this.currentMs;
  }

  /**
   * Schedules a callback at now plus the delay.
   *
   * @param callback Function to run.
   * @param delayMs Delay in milliseconds.
   * @returns Timer handle.
   */
  setTimeout(callback: () => void, delayMs: number): unknown {
    const id = this.nextId;
    this.nextId += 1;
    this.timers.push({ id, at: this.currentMs + delayMs, callback });
    return id;
  }

  /**
   * Cancels a scheduled callback.
   *
   * @param handle Timer handle from setTimeout.
   */
  clearTimeout(handle: unknown): void {
    const id = handle as number;
    const index = this.timers.findIndex((timer) => timer.id === id);
    if (index >= 0) this.timers.splice(index, 1);
  }

  /**
   * Advances time and runs every timer that is due.
   *
   * @param ms Milliseconds to add to the clock.
   */
  advance(ms: number): void {
    this.currentMs += ms;
    this.runDueTimers();
  }

  /** Runs due timers, including any that were scheduled by earlier timers. */
  private runDueTimers(): void {
    for (;;) {
      const due = this.nextDueTimer();
      if (due === null) return;
      due.callback();
    }
  }

  /**
   * Removes and returns the next due timer, if any.
   *
   * @returns Due timer, or null when none are due.
   */
  private nextDueTimer(): DiscordRichPresenceFakeTimer | null {
    const index = this.timers.findIndex((timer) => timer.at <= this.currentMs);
    if (index < 0) return null;
    const [timer] = this.timers.splice(index, 1);
    return timer ?? null;
  }
}
