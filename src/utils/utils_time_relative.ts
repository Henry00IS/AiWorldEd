/** Milliseconds in one minute. */
const TIME_RELATIVE_MINUTE_MS = 60_000;

/** Milliseconds in one hour. */
const TIME_RELATIVE_HOUR_MS = 60 * TIME_RELATIVE_MINUTE_MS;

/** Milliseconds in one day. */
const TIME_RELATIVE_DAY_MS = 24 * TIME_RELATIVE_HOUR_MS;

/**
 * Words how long ago a moment was: "just now", "5 min ago", "3 h ago",
 * "yesterday" or "4 days ago". Moments in the future read as "just now".
 *
 * @param time Moment in milliseconds.
 * @param now Current time in milliseconds.
 * @returns Short relative time.
 */
export function timeRelativeText(time: number, now: number): string {
  const elapsed = Math.max(0, now - time);
  if (elapsed < TIME_RELATIVE_MINUTE_MS) return 'just now';
  if (elapsed < TIME_RELATIVE_HOUR_MS) return `${Math.floor(elapsed / TIME_RELATIVE_MINUTE_MS)} min ago`;
  if (elapsed < TIME_RELATIVE_DAY_MS) return `${Math.floor(elapsed / TIME_RELATIVE_HOUR_MS)} h ago`;
  const days = Math.floor(elapsed / TIME_RELATIVE_DAY_MS);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}
