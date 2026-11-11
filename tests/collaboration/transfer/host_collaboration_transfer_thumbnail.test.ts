import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  hostCollaborationTransferThumbnail,
  hostCollaborationTransferThumbnailName,
} from '@/collaboration/transfer/host_collaboration_transfer_thumbnail.js';
import { curveFileWrite } from '@/curve/model/curve_file.js';
import { curveFromPolyline } from '@/curve/model/curve_model.js';

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
