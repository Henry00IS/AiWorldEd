/** Clock used to schedule Discord reconnects and activity throttling. */
export interface DiscordRichPresenceClock {
  /** Current time in milliseconds. */
  now(): number;
  /**
   * Schedules a callback after a delay.
   *
   * @param callback Function to run.
   * @param delayMs Delay in milliseconds.
   * @returns Timer handle.
   */
  setTimeout(callback: () => void, delayMs: number): unknown;
  /**
   * Cancels a scheduled callback.
   *
   * @param handle Timer handle from setTimeout.
   */
  clearTimeout(handle: unknown): void;
}

/**
 * Returns a clock backed by the process timers and wall clock.
 *
 * @returns System clock.
 */
export function discordRichPresenceClockSystem(): DiscordRichPresenceClock {
  return {
    now: () => Date.now(),
    setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
    clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
}
