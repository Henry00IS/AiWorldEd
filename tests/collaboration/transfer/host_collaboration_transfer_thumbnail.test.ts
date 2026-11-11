import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  hostCollaborationTransferThumbnail,
  hostCollaborationTransferThumbnailName,
} from '@/collaboration/transfer/host_collaboration_transfer_thumbnail.js';
import { curveFileWrite } from '@/curve/model/curve_file.js';
import { curveFromPolyline } from '@/curve/model/curve_model.js';
import type { SceneJSON } from '@/io/scene/io_types.js';
import { sceneFileWorldText, sceneFileWrite } from '@/io/scene_file/scene_file_zip.js';

const TEXT = curveFileWrite(
  curveFromPolyline([
    [0, 0],
    [0.5, 1],
    [1, 0.2],
  ]),
  'Ramp',
);

/**
 * Makes new canvases draw nothing and encode a fixed PNG, recording them.
 *
 * @returns Canvases created from now on.
 */
function canvasStub(): HTMLCanvasElement[] {
  const created: HTMLCanvasElement[] = [];
  const create = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    const element = create(tag);
    if (!(element instanceof HTMLCanvasElement)) return element;
    created.push(element);
    const context = new Proxy({}, { get: () => () => undefined });
    element.getContext = (() => context) as never;
    element.toBlob = (done: BlobCallback) => done(new Blob(['png'], { type: 'image/png' }));
    return element;
  });
  return created;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Curve link previews: only readable .curve files render, as a large PNG. */
describe('host_collaboration_transfer_thumbnail', () => {
  it('renders a readable curve as a 1200 by 630 PNG', async () => {
    const created = canvasStub();
    const png = await hostCollaborationTransferThumbnail(new Blob([TEXT]), 'Ramp.curve');
    expect(png?.type).toBe('image/png');
    expect(created.map((canvas) => [canvas.width, canvas.height])).toEqual([[1200, 630]]);
  });

  it('renders nothing for other files and unreadable curves', async () => {
    const created = canvasStub();
    expect(await hostCollaborationTransferThumbnail(new Blob([TEXT]), 'notes.txt')).toBeNull();
    expect(await hostCollaborationTransferThumbnail(new Blob(['nope']), 'a.curve')).toBeNull();
    expect(created).toEqual([]);
  });

  it('names the preview after the file', () => {
    expect(hostCollaborationTransferThumbnailName('Ramp v2.curve')).toBe('Ramp v2.png');
  });
});

/**
 * Builds a WebP-looking image.
 *
 * @returns Bytes.
 */
function webpBytes(): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(64);
  bytes.set([0x52, 0x49, 0x46, 0x46, 56, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
  return bytes;
}

/**
 * Writes a level file.
 *
 * @param thumbnail Optional thumbnail.
 * @returns File.
 */
async function levelWrite(thumbnail: Blob | null): Promise<Blob> {
  const parts: Uint8Array<ArrayBuffer>[] = [];
  await sceneFileWrite(
    sceneFileWorldText({ version: 1, objects: [] } as SceneJSON),
    [],
    async (chunk) => void parts.push(new Uint8Array(chunk)),
    thumbnail,
  );
  return new Blob(parts);
}

/**
 * Makes ImageBitmap and OffscreenCanvas encode a fixed PNG at 1200 by 630.
 *
 * @returns Canvases created from now on.
 */
function letterboxStub(): { width: number; height: number }[] {
  const created: { width: number; height: number }[] = [];
  vi.stubGlobal('createImageBitmap', async () => ({ width: 256, height: 256, close() {} }) as ImageBitmap);
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      width: number;
      height: number;
      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
        created.push(this);
      }
      getContext() {
        return { fillStyle: '', fillRect() {}, drawImage() {} };
      }
      convertToBlob() {
        return Promise.resolve(new Blob(['png'], { type: 'image/png' }));
      }
    },
  );
  return created;
}

describe('host collaboration transfer level thumbnail', () => {
  it('letterboxes a level thumbnail to a 1200 by 630 PNG', async () => {
    const created = letterboxStub();
    const file = await levelWrite(new Blob([webpBytes()], { type: 'image/webp' }));
    const png = await hostCollaborationTransferThumbnail(file, 'Start.aiworld');
    expect(png?.type).toBe('image/png');
    expect(created.map((canvas) => [canvas.width, canvas.height])).toEqual([[1200, 630]]);
  });

  it('renders nothing for a level without a thumbnail', async () => {
    const created = letterboxStub();
    expect(await hostCollaborationTransferThumbnail(await levelWrite(null), 'Start.aiworld')).toBeNull();
    expect(created).toEqual([]);
  });

  it('names the preview after the level file', () => {
    expect(hostCollaborationTransferThumbnailName('Start.aiworld')).toBe('Start.png');
  });
});
