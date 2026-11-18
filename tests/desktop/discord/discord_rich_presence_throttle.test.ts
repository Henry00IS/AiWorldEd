import { describe, expect, it } from 'vitest';
import { DISCORD_RICH_PRESENCE_THROTTLE_MS } from '@/desktop/discord/discord_rich_presence_constants.js';
import { discordRichPresenceThrottleWaitMs } from '@/desktop/discord/discord_rich_presence_throttle.js';
import { discordIpcBackoffDelay } from '@/desktop/discord/discord_ipc_backoff.js';
import {
  DISCORD_IPC_BACKOFF_INITIAL_MS,
  DISCORD_IPC_BACKOFF_MAXIMUM_MS,
} from '@/desktop/discord/discord_rich_presence_constants.js';

describe('discord_rich_presence_throttle', () => {
  it('lets the first update through and then waits until 15 seconds have passed', () => {
    expect(discordRichPresenceThrottleWaitMs(null, 1000, DISCORD_RICH_PRESENCE_THROTTLE_MS)).toBe(0);
    expect(discordRichPresenceThrottleWaitMs(1000, 1000, DISCORD_RICH_PRESENCE_THROTTLE_MS)).toBe(15_000);
    expect(discordRichPresenceThrottleWaitMs(1000, 6000, DISCORD_RICH_PRESENCE_THROTTLE_MS)).toBe(10_000);
    expect(discordRichPresenceThrottleWaitMs(1000, 16_000, DISCORD_RICH_PRESENCE_THROTTLE_MS)).toBe(0);
    expect(DISCORD_RICH_PRESENCE_THROTTLE_MS).toBe(15_000);
  });
});

describe('discord_ipc_backoff', () => {
  it('doubles the delay from one second up to one minute', () => {
    expect(discordIpcBackoffDelay(0)).toBe(DISCORD_IPC_BACKOFF_INITIAL_MS);
    expect(discordIpcBackoffDelay(1)).toBe(2_000);
    expect(discordIpcBackoffDelay(2)).toBe(4_000);
    expect(discordIpcBackoffDelay(6)).toBe(DISCORD_IPC_BACKOFF_MAXIMUM_MS);
    expect(discordIpcBackoffDelay(20)).toBe(DISCORD_IPC_BACKOFF_MAXIMUM_MS);
  });
});
