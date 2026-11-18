/**
 * Returns how long to wait before the next Discord activity update.
 *
 * @param lastSentAt Time of the last sent update, or null when none was sent.
 * @param now Current time in milliseconds.
 * @param intervalMs Minimum time between updates.
 * @returns Milliseconds to wait, or 0 when an update may be sent now.
 */
export function discordRichPresenceThrottleWaitMs(lastSentAt: number | null, now: number, intervalMs: number): number {
  if (lastSentAt === null) return 0;
  const elapsed = now - lastSentAt;
  if (elapsed >= intervalMs) return 0;
  return intervalMs - elapsed;
}
