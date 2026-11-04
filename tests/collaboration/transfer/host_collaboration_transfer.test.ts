// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SocketCollaborationError,
  type SocketCollaborationMessage,
} from '@/collaboration/net/socket_collaboration_types.js';
import { transferFrameParse } from '@/collaboration/shared/binary_frame.js';
import { TRANSFER_CHUNK_BYTES } from '@/collaboration/shared/protocol_definitions.js';
import {
  HostCollaborationTransfer,
  hostCollaborationTransferUrl,
} from '@/collaboration/transfer/host_collaboration_transfer.js';

const LINK = 'L'.repeat(43);

/**
 * Creates a host whose relay replies with the given results in order.
 *
 * @param replies Replies or errors for `transfer.create`.
 * @returns Host and what it sent.
 */
function fixture(replies: (SocketCollaborationMessage | Error)[]) {
  const sent: object[] = [];
  const frames: Uint8Array[] = [];
  const request = vi.fn(async () => {
    const reply = replies.shift();
    if (reply === undefined || reply instanceof Error) throw reply ?? new Error('no reply');
    return reply;
  });
  const host = new HostCollaborationTransfer({
    request,
    send: (message) => sent.push(message),
    sendBinary: (frame) => frames.push(frame),
  });
  return { host, sent, frames, request };
}

afterEach(() => {
  vi.useRealTimers();
});

/** Editor side of transfer links: link creation, info and chunk answers. */
describe('host_collaboration_transfer', () => {
  it('registers a link and returns the cleaned file details', async () => {
    const { host } = fixture([{ t: 'transfer.created', link: LINK, expiresInMs: 3_600_000 }]);
    const shared = await host.share(new Blob(['x'], { type: 'text/plain;charset=utf-8' }), '../CON.txt');
    expect(shared.link).toBe(LINK);
    expect(shared.size).toBe(1);
    expect(shared.mime).toBe('text/plain');
    expect(shared.name).not.toContain('/');
  });

  it('waits out a rate limit and retries', async () => {
    vi.useFakeTimers();
    const limited = new SocketCollaborationError('transfer_rate_limited', {
      t: 'error',
      code: 'transfer_rate_limited',
      retryAfterMs: 4000,
    });
    const { host, request } = fixture([limited, { t: 'transfer.created', link: LINK }]);
    const pending = host.share(new Blob(['x']), 'a.bin');
    await vi.advanceTimersByTimeAsync(4000);
    expect((await pending).link).toBe(LINK);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('answers info and streams chunks as binary frames', async () => {
    const { host, sent, frames } = fixture([{ t: 'transfer.created', link: LINK }]);
    const bytes = new Uint8Array(TRANSFER_CHUNK_BYTES + 10).map((_, index) => index % 251);
    await host.share(new Blob([bytes], { type: 'application/octet-stream' }), 'data.bin');
    expect(host.handle({ t: 'transfer.get', q: 5, link: LINK })).toBe(true);
    expect(sent).toEqual([
      { t: 'transfer.info', q: 5, size: bytes.length, name: 'data.bin', mime: 'application/octet-stream' },
    ]);
    host.handle({ t: 'transfer.chunk', q: 5, offset: 0, length: TRANSFER_CHUNK_BYTES });
    host.handle({ t: 'transfer.chunk', q: 5, offset: TRANSFER_CHUNK_BYTES, length: TRANSFER_CHUNK_BYTES });
    await vi.waitFor(() => expect(frames.length).toBe(2));
    const second = transferFrameParse(frames[1] ?? new Uint8Array());
    expect(second?.q).toBe(5);
    expect(second?.offset).toBe(TRANSFER_CHUNK_BYTES);
    expect(Array.from(second?.payload ?? [])).toEqual(Array.from(bytes.slice(TRANSFER_CHUNK_BYTES)));
  });

  it('serves arbitrary offsets and keeps a running query over many aborted ones', async () => {
    const { host, frames } = fixture([{ t: 'transfer.created', link: LINK }]);
    const bytes = new Uint8Array(TRANSFER_CHUNK_BYTES * 3).map((_, index) => index % 249);
    await host.share(new Blob([bytes]), 'clip.mp4');
    host.handle({ t: 'transfer.get', q: 1, link: LINK });
    host.handle({ t: 'transfer.chunk', q: 1, offset: 0, length: TRANSFER_CHUNK_BYTES });
    for (let q = 2; q < 200; q++) {
      host.handle({ t: 'transfer.get', q, link: LINK });
      if (q % 32 === 0) host.handle({ t: 'transfer.chunk', q: 1, offset: 7, length: 10 });
    }
    host.handle({ t: 'transfer.chunk', q: 1, offset: TRANSFER_CHUNK_BYTES * 2 + 3, length: 100 });
    await vi.waitFor(() => expect(frames.length).toBe(8));
    const last = transferFrameParse(frames[7] ?? new Uint8Array());
    expect(last?.offset).toBe(TRANSFER_CHUNK_BYTES * 2 + 3);
    expect(Array.from(last?.payload ?? [])).toEqual(Array.from(bytes.slice(last?.offset, (last?.offset ?? 0) + 100)));
  });

  it('reports unknown links as missing and ignores other messages', () => {
    const { host, sent } = fixture([]);
    host.handle({ t: 'transfer.get', q: 1, link: LINK });
    expect(sent).toEqual([{ t: 'transfer.missing', q: 1 }]);
    expect(host.handle({ t: 'chat' })).toBe(false);
  });

  it('builds the download URL from the relay URL', () => {
    expect(hostCollaborationTransferUrl('wss://relay.test/wsdev?x=1', LINK)).toBe(
      `https://relay.test/wsdev/transfer/${LINK}`,
    );
    expect(hostCollaborationTransferUrl('ws://127.0.0.1:8787/', LINK)).toBe(`http://127.0.0.1:8787/transfer/${LINK}`);
  });
});
