import { describe, expect, it } from 'vitest';
import { OutboxCollaborationBucket } from '@/collaboration/net/outbox_collaboration_bucket.js';

/** Client-side rate limiter that keeps the client under the relay limits. */
describe('outbox_collaboration_bucket', () => {
  it('allows a burst, then waits for refill', () => {
    let now = 0;
    const burst = 3;
    const rate = 10;
    const bucket = new OutboxCollaborationBucket(rate, burst, 1e6, 1e6, () => now);
    for (let index = 0; index < burst; index++) expect(bucket.take(1)).toBe(true);
    expect(bucket.take(1)).toBe(false);
    const wait = bucket.waitMs(1);
    expect(wait).toBeGreaterThan(0);
    now += wait;
    expect(bucket.take(1)).toBe(true);
  });

  it('limits bytes independently of messages', () => {
    let now = 0;
    const byteBurst = 100;
    const bucket = new OutboxCollaborationBucket(1000, 1000, byteBurst, byteBurst, () => now);
    expect(bucket.take(byteBurst)).toBe(true);
    expect(bucket.take(1)).toBe(false);
    now += bucket.waitMs(byteBurst);
    expect(bucket.take(byteBurst * 10)).toBe(true);
  });
});
