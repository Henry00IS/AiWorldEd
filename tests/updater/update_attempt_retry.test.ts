import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  UpdateAttemptTimeoutError,
  updateAttemptWithStallLimit,
  updateAttemptWithTimeout,
  updateAttemptsWithRetry,
} from '@/updater/update_attempt_retry.js';

describe('update attempt retry', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects an attempt that is still pending when its real timer runs out', async () => {
    vi.useFakeTimers();
    const attempt = updateAttemptWithTimeout(new Promise<string>(() => undefined), 20000);
    const outcome = expect(attempt).rejects.toBeInstanceOf(UpdateAttemptTimeoutError);

    await vi.advanceTimersByTimeAsync(20000);

    await outcome;
  });

  it('settles with an attempt that answers in time and cancels its timer', async () => {
    vi.useFakeTimers();
    const attempt = updateAttemptWithTimeout(Promise.resolve('answer'), 20000);

    await expect(attempt).resolves.toBe('answer');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('restarts the stall limit on each activity, with no total time limit', async () => {
    vi.useFakeTimers();
    let activity = () => undefined as void;
    let finish = (_value: string) => undefined as void;
    const attempt = updateAttemptWithStallLimit((watch) => {
      activity = watch.activity;
      return new Promise<string>((resolve) => (finish = resolve));
    }, 30000);
    for (let step = 0; step < 10; step++) {
      await vi.advanceTimersByTimeAsync(29000);
      activity();
    }
    finish('done');

    await expect(attempt).resolves.toBe('done');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects once nothing happened for the stall limit and ignores later activity', async () => {
    vi.useFakeTimers();
    let activity = () => undefined as void;
    const attempt = updateAttemptWithStallLimit((watch) => {
      activity = watch.activity;
      return new Promise<string>(() => undefined);
    }, 30000);
    const outcome = expect(attempt).rejects.toBeInstanceOf(UpdateAttemptTimeoutError);

    await vi.advanceTimersByTimeAsync(30000);
    await outcome;
    activity();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops the stall limit while paused until the next activity', async () => {
    vi.useFakeTimers();
    let watched: { activity(): void; pause(): void } | null = null;
    let finish = (_value: string) => undefined as void;
    const attempt = updateAttemptWithStallLimit((watch) => {
      watched = watch;
      return new Promise<string>((resolve) => (finish = resolve));
    }, 30000);
    watched!.pause();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    watched!.activity();
    expect(vi.getTimerCount()).toBe(1);
    finish('done');

    await expect(attempt).resolves.toBe('done');
  });

  it('stops retrying at the first success and reports each retry', async () => {
    const waits: number[] = [];
    const retries: number[] = [];
    const runAttempt = vi
      .fn<(attemptIndex: number) => Promise<string>>()
      .mockRejectedValueOnce(new Error('first'))
      .mockResolvedValueOnce('second');

    const result = await updateAttemptsWithRetry(
      runAttempt,
      { retryDelaysMs: [1000, 3000, 9000] },
      async (milliseconds) => {
        waits.push(milliseconds);
      },
      (_failure, nextAttemptIndex) => retries.push(nextAttemptIndex),
    );

    expect(result).toBe('second');
    expect(waits).toEqual([1000]);
    expect(retries).toEqual([1]);
  });
});
