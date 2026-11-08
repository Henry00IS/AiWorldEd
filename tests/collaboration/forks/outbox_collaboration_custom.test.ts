import { afterEach, expect, it, vi } from 'vitest';
import { OutboxCollaborationCustom } from '@/collaboration/forks/outbox_collaboration_custom.js';
import { customFrameEncode } from '@/collaboration/shared/custom_frame.js';

afterEach(() => vi.useRealTimers());

/**
 * Hundreds of small frames bypass the ordinary 96 msg/s edit bucket and yield
 * to edits.
 */
it('sends 500 small messages promptly while yielding between bounded batches', async () => {
  vi.useFakeTimers();
  const events: string[] = [];
  const outbox = new OutboxCollaborationCustom(
    () => events.push('custom'),
    () => true,
    () => Date.now(),
  );
  for (let r = 0; r < 500; r++) outbox.enqueue(customFrameEncode(r, 0, new Uint8Array([r % 256])));
  events.push('edit');
  await vi.advanceTimersByTimeAsync(50);
  expect(events[0]).toBe('edit');
  expect(events.filter((e) => e === 'custom')).toHaveLength(500);
  outbox.clear();
});

/**
 * Exact rolling payload budget prevents token-bucket bursts across second
 * boundaries.
 */
it('paces 256 KiB plus one byte into separate sliding windows', async () => {
  vi.useFakeTimers();
  const sent = vi.fn();
  const outbox = new OutboxCollaborationCustom(
    sent,
    () => true,
    () => Date.now(),
  );
  outbox.enqueue(customFrameEncode(1, 0, new Uint8Array(256 * 1024)));
  outbox.enqueue(customFrameEncode(2, 0, new Uint8Array(1)));
  await vi.advanceTimersByTimeAsync(1000);
  expect(sent).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(sent).toHaveBeenCalledTimes(2);
  outbox.clear();
});

/** Empty messages still obey the independent frame-count bound. */
it('paces the 4097th frame and pauses for queued edits without reordering custom frames', async () => {
  vi.useFakeTimers();
  const ids: number[] = [];
  let idle = false;
  const outbox = new OutboxCollaborationCustom(
    (frame) => ids.push(new DataView(frame.buffer).getUint32(4)),
    () => idle,
    () => Date.now(),
  );
  for (let r = 1; r <= 4097; r++) outbox.enqueue(customFrameEncode(r, 0, new Uint8Array()));
  await vi.advanceTimersByTimeAsync(20);
  expect(ids).toHaveLength(0);
  idle = true;
  await vi.advanceTimersByTimeAsync(1000);
  expect(ids).toHaveLength(4096);
  await vi.advanceTimersByTimeAsync(1001);
  expect(ids).toEqual(Array.from({ length: 4097 }, (_, i) => i + 1));
  outbox.clear();
});

/**
 * Closing a connection cancels queued frames; oversize data cannot wait
 * forever.
 */
it('clears pending sends and rejects an oversize single payload', async () => {
  vi.useFakeTimers();
  const sent = vi.fn();
  const outbox = new OutboxCollaborationCustom(sent, () => true);
  expect(() => outbox.enqueue(customFrameEncode(1, 0, new Uint8Array(256 * 1024 + 1)))).toThrow('256 KiB');
  outbox.enqueue(customFrameEncode(2, 0, new Uint8Array()));
  outbox.clear();
  await vi.runAllTimersAsync();
  expect(sent).not.toHaveBeenCalled();
});
