import { DISCORD_IPC_BACKOFF_INITIAL_MS, DISCORD_IPC_BACKOFF_MAXIMUM_MS } from './discord_rich_presence_constants.js';

/**
 * Returns the reconnect delay for a failed-attempt count.
 *
 * @param attempt Zero-based number of failed reconnects so far.
 * @returns Delay in milliseconds, doubled each attempt up to the maximum.
 */
export function discordIpcBackoffDelay(attempt: number): number {
  const exponent = Math.max(0, Math.floor(attempt));
  const delay = DISCORD_IPC_BACKOFF_INITIAL_MS * 2 ** exponent;
  return Math.min(DISCORD_IPC_BACKOFF_MAXIMUM_MS, delay);
}
