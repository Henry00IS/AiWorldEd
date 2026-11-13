import { afterEach, describe, expect, it, vi } from 'vitest';
import { USER_IDLE_MS, UserIdle } from '@/utils/user_idle.js';

afterEach(() => vi.useRealTimers());

describe('UserIdle', () => {
  it('becomes idle after 30 s without input and busy again on any input', () => {
    let now = 1000;
    let hidden = false;
    const target = new EventTarget();
    const idle = new UserIdle({ target, now: () => now, hidden: () => hidden });
    expect(idle.idle()).toBe(false);
    now += USER_IDLE_MS;
    expect(idle.idle()).toBe(true);
    for (const type of ['pointermove', 'pointerdown', 'wheel', 'keydown', 'focusin', 'dragover', 'touchstart']) {
      target.dispatchEvent(new Event(type));
      expect(idle.idle(), type).toBe(false);
      now += USER_IDLE_MS;
    }
    target.dispatchEvent(new Event('keydown'));
    hidden = true;
    expect(idle.idle()).toBe(true);
    idle.dispose();
  });

  it('waits until the input has been quiet for the whole window', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const target = new EventTarget();
    const idle = new UserIdle({ target, hidden: () => false });
    let done = false;
    void idle.idleWait().then(() => (done = true));
    await vi.advanceTimersByTimeAsync(USER_IDLE_MS - 1000);
    target.dispatchEvent(new Event('pointermove'));
    await vi.advanceTimersByTimeAsync(USER_IDLE_MS - 1000);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(done).toBe(true);
  });

  it('stops waiting when cancelled', async () => {
    const idle = new UserIdle({ target: new EventTarget(), hidden: () => false });
    const abort = new AbortController();
    const wait = idle.idleWait(abort.signal);
    abort.abort();
    await expect(wait).rejects.toBeDefined();
  });

  it('notifies activity subscribers on input and unsubscribes', () => {
    const target = new EventTarget();
    const idle = new UserIdle({ target, hidden: () => false });
    const first = vi.fn();
    const second = vi.fn();
    const stopFirst = idle.activitySubscribe(first);
    idle.activitySubscribe(second);
    target.dispatchEvent(new Event('pointermove'));
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    stopFirst();
    target.dispatchEvent(new Event('keydown'));
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
    idle.dispose();
  });
});
