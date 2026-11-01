import { describe, expect, it } from 'vitest';
import { StreamCollaborationSender } from '@/collaboration/net/stream_collaboration_sender.js';
import { StreamCollaborationReceiver } from '@/collaboration/net/stream_collaboration_receiver.js';

/**
 * Creates a sender that records its output.
 *
 * @param chunk Chunk size.
 * @param window Flow-control window.
 * @returns Sender, sent messages and frames.
 */
function senderCreate(
  chunk: number,
  window: number,
): { sender: StreamCollaborationSender; messages: Record<string, unknown>[]; frames: Uint8Array[] } {
  const messages: Record<string, unknown>[] = [];
  const frames: Uint8Array[] = [];
  const sender = new StreamCollaborationSender(
    { send: (message) => messages.push(message as Record<string, unknown>), sendBinary: (frame) => frames.push(frame) },
    chunk,
    window,
  );
  return { sender, messages, frames };
}

/**
 * Creates a payload of a given size with distinct bytes.
 *
 * @param size Byte count.
 * @returns Payload.
 */
function payloadCreate(size: number): Uint8Array {
  return Uint8Array.from({ length: size }, (_, index) => index % 251);
}

/** Owner-to-member streaming of snapshots and textures with flow control. */
describe('stream_collaboration_sender', () => {
  it('stops at the window and resumes on credit', () => {
    const chunk = 4;
    const { sender, messages, frames } = senderCreate(chunk, chunk * 2);
    const bytes = payloadCreate(chunk * 5);
    const stream = sender.start(2, 'asset', bytes, 'tex.png', 'image/png');
    expect(frames).toHaveLength(2);
    expect(sender.activeCountFor(2)).toBe(1);
    sender.credit(2, stream, chunk * 2);
    expect(frames).toHaveLength(4);
    sender.credit(2, stream, chunk * 4);
    expect(frames).toHaveLength(5);
    expect(messages[messages.length - 1]).toEqual({ t: 'stream.end', to: 2, stream });
    expect(sender.activeCount()).toBe(0);
  });

  it('reassembles a stream byte-for-byte on the receiver', () => {
    const { sender, messages, frames } = senderCreate(5, 1000);
    const bytes = payloadCreate(23);
    const stream = sender.start(3, 'snapshot', bytes);
    const receiver = new StreamCollaborationReceiver(1000, 5);
    receiver.begin(messages[0] ?? {});
    frames.forEach((frame) => receiver.chunk(frame));
    expect([...(receiver.end(stream)?.bytes ?? [])]).toEqual([...bytes]);
  });

  it('rejects oversized, truncated and unknown streams', () => {
    const receiver = new StreamCollaborationReceiver(10, 10);
    expect(receiver.begin({ stream: 1, size: 11, kind: 'asset' })).toBeNull();
    expect(receiver.begin({ stream: 1, size: 5, kind: 'script' })).toBeNull();
    receiver.begin({ stream: 1, size: 5, kind: 'asset' });
    expect(receiver.end(1)).toBeNull();
    expect(receiver.abort(2)).toBeUndefined();
  });

  it('forgets streams of a departed recipient', () => {
    const { sender } = senderCreate(1, 1);
    sender.start(4, 'asset', payloadCreate(8));
    sender.start(5, 'asset', payloadCreate(8));
    sender.forgetRecipient(4);
    expect(sender.activeCountFor(4)).toBe(0);
    expect(sender.activeCount()).toBe(1);
  });
});
