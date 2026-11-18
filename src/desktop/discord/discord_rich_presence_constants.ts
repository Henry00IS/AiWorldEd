/**
 * Rich Presence large-image art asset key. Upload an image with this key under
 * Rich Presence Art Assets in the Discord Developer Portal for application
 * 1572713988733538375.
 */
export const DISCORD_RICH_PRESENCE_LARGE_IMAGE_KEY = 'logo';

/** Minimum time between Discord SET_ACTIVITY updates, in milliseconds. */
export const DISCORD_RICH_PRESENCE_THROTTLE_MS = 15_000;

/** Handshake reply timeout, in milliseconds. */
export const DISCORD_IPC_HANDSHAKE_TIMEOUT_MS = 5_000;

/** First reconnect delay when Discord is unavailable, in milliseconds. */
export const DISCORD_IPC_BACKOFF_INITIAL_MS = 1_000;

/** Longest reconnect delay when Discord is unavailable, in milliseconds. */
export const DISCORD_IPC_BACKOFF_MAXIMUM_MS = 60_000;

/** Highest Discord IPC socket index tried, inclusive. */
export const DISCORD_IPC_SOCKET_INDEX_MAXIMUM = 9;
