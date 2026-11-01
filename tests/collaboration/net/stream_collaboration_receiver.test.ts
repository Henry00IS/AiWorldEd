import { describe, expect, it } from 'vitest';
import { StreamCollaborationReceiver } from '@/collaboration/net/stream_collaboration_receiver.js';
import { binaryFrameEncode } from '@/collaboration/shared/binary_frame.js';

/**
 * Builds a stream.begin message.
 *
 * @param stream Stream id.
 * @param size Announced byte count.
 * @returns Begin message.
 */
function beginMessage(stream: number, size: number): Record<string, unknown> {
  return { t: 'stream.begin', stream, kind: 'asset', size, name: 'brick.png', mime: 'image/png' };
}

describe('StreamCollaborationReceiver', () => {
  it('does not allocate an announced size before the bytes arrive', () => {
    const receiver = new StreamCollaborationReceiver(256 * 1024 * 1024, 1024);
    const incoming = receiver.begin(beginMessage(1, 256 * 1024 * 1024));
    expect(incoming).not.toBeNull();
    expect(incoming?.bytes.byteLength).toBe(0);
  });

  it('joins chunks in order when the stream completes', () => {
    const receiver = new StreamCollaborationReceiver(1024, 1024);
    receiver.begin(beginMessage(3, 5));
    receiver.chunk(binaryFrameEncode(3, 7, new Uint8Array([1, 2])));
    receiver.chunk(binaryFrameEncode(3, 7, new Uint8Array([3, 4, 5])));
    expect([...(receiver.end(3)?.bytes ?? [])]).toEqual([1, 2, 3, 4, 5]);
  });

  it('refuses streams beyond the concurrent maximum until one ends', () => {
    const receiver = new StreamCollaborationReceiver(1024, 1024, 2);
    expect(receiver.begin(beginMessage(1, 4))).not.toBeNull();
    expect(receiver.begin(beginMessage(2, 4))).not.toBeNull();
    expect(receiver.begin(beginMessage(3, 4))).toBeNull();
    receiver.abort(1);
    expect(receiver.begin(beginMessage(3, 4))).not.toBeNull();
  });
});
