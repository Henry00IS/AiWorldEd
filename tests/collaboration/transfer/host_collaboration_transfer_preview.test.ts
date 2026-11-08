// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { transferFrameParse } from '@/collaboration/shared/binary_frame.js';
import { TRANSFER_CHUNK_BYTES } from '@/collaboration/shared/protocol_definitions.js';
import {
  HOST_COLLABORATION_TRANSFER_PREVIEW_KEEP_MS,
  HostCollaborationTransfer,
} from '@/collaboration/transfer/host_collaboration_transfer.js';

const LINK = 'C'.repeat(43);

/**
 * Lets pending promises and blob reads finish without running timers.
 *
 * @returns After a few event loop turns.
 */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 10; turn++) await new Promise((resolve) => setImmediate(resolve));
}

/**
 * Creates a host sharing a curve whose preview is a PNG of the given size.
 *
 * @param pngBytes Preview size.
 * @returns Host, what it sent and the render spy.
 */
async function fixture(pngBytes: number) {
  const sent: Record<string, unknown>[] = [];
  const frames: Uint8Array[] = [];
  const render = vi.fn(async () => new Blob([new Uint8Array(pngBytes)], { type: 'image/png' }));
  const port = {
    request: async () => ({ t: 'transfer.created', link: LINK }),
    send: (message: object) => sent.push(message as Record<string, unknown>),
    sendBinary: (frame: Uint8Array) => frames.push(frame),
  };
  const host = new HostCollaborationTransfer(port, render);
  await host.share(new Blob(['{}'], { type: 'application/json' }), 'ramp.curve');
  return { host, sent, frames, render };
}

/**
 * Asks for one preview chunk.
 *
 * @param host Host.
 * @param q Query id.
 * @param index Chunk index.
 */
function chunk(host: HostCollaborationTransfer, q: number, index: number): void {
  host.handle({ t: 'transfer.chunk', q, offset: index * TRANSFER_CHUNK_BYTES, length: TRANSFER_CHUNK_BYTES });
}

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Link previews: rendered once, shared, and dropped as soon as nobody needs
 * them.
 */
describe('host_collaboration_transfer previews', () => {
  it('answers a preview request with the PNG and a plain request with the file', async () => {
    const { host, sent } = await fixture(10);
    host.handle({ t: 'transfer.get', q: 1, link: LINK, thumbnail: true });
    host.handle({ t: 'transfer.get', q: 2, link: LINK });
    await settle();
    expect(sent).toEqual([
      { t: 'transfer.info', q: 2, size: 2, name: 'ramp.curve', mime: 'application/json' },
      { t: 'transfer.info', q: 1, size: 10, name: 'ramp.png', mime: 'image/png' },
    ]);
  });

  it('reports files without a preview as missing', async () => {
    const sent: object[] = [];
    const port = { request: async () => ({ t: 'transfer.created', link: LINK }), send: (m: object) => sent.push(m) };
    const host = new HostCollaborationTransfer({ ...port, sendBinary: () => undefined });
    await host.share(new Blob(['x']), 'notes.txt');
    host.handle({ t: 'transfer.get', q: 4, link: LINK, thumbnail: true });
    await settle();
    expect(sent).toEqual([{ t: 'transfer.missing', q: 4 }]);
  });

  it('renders once for concurrent requests and drops a single-chunk PNG once all are served', async () => {
    const { host, frames, render } = await fixture(100);
    host.handle({ t: 'transfer.get', q: 1, link: LINK, thumbnail: true });
    host.handle({ t: 'transfer.get', q: 2, link: LINK, thumbnail: true });
    await settle();
    expect(render).toHaveBeenCalledTimes(1);
    chunk(host, 1, 0);
    chunk(host, 2, 0);
    await settle();
    expect(frames.map((frame) => transferFrameParse(frame)?.payload.length)).toEqual([100, 100]);
    host.handle({ t: 'transfer.get', q: 3, link: LINK, thumbnail: true });
    await settle();
    expect(render).toHaveBeenCalledTimes(2);
  });

  it('keeps a multi-chunk PNG 30 seconds after each chunk, then fails the download', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { host, frames } = await fixture(TRANSFER_CHUNK_BYTES * 3);
    host.handle({ t: 'transfer.get', q: 1, link: LINK, thumbnail: true });
    await settle();
    chunk(host, 1, 0);
    vi.advanceTimersByTime(HOST_COLLABORATION_TRANSFER_PREVIEW_KEEP_MS - 1);
    chunk(host, 1, 1);
    vi.advanceTimersByTime(HOST_COLLABORATION_TRANSFER_PREVIEW_KEEP_MS);
    chunk(host, 1, 2);
    await settle();
    expect(frames.map((frame) => transferFrameParse(frame)?.offset)).toEqual([0, TRANSFER_CHUNK_BYTES]);
  });

  it('drops a finished multi-chunk PNG at once and every preview when the connection ends', async () => {
    const { host, frames, render } = await fixture(TRANSFER_CHUNK_BYTES + 1);
    host.handle({ t: 'transfer.get', q: 1, link: LINK, thumbnail: true });
    await settle();
    chunk(host, 1, 0);
    chunk(host, 1, 1);
    host.handle({ t: 'transfer.get', q: 2, link: LINK, thumbnail: true });
    await settle();
    expect(render).toHaveBeenCalledTimes(2);
    host.clear();
    chunk(host, 2, 0);
    await settle();
    expect(frames).toHaveLength(2);
  });
});
