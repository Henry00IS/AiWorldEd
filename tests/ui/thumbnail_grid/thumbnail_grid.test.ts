import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  THUMBNAIL_GRID_SIZE_VARIABLE,
  ThumbnailGrid,
  thumbnailGridSizeSnap,
  thumbnailGridThumbCreate,
  thumbnailGridThumbSet,
  thumbnailGridTileRelease,
} from '@/ui/thumbnail_grid/thumbnail_grid.js';

/**
 * Builds a grid of a given inner width (8 px padding each side).
 *
 * @param width Client width in CSS pixels.
 * @returns Grid element.
 */
function gridCreate(width: number): HTMLElement {
  const grid = document.createElement('div');
  grid.style.padding = '8px';
  Object.defineProperty(grid, 'clientWidth', { configurable: true, get: () => width });
  document.body.appendChild(grid);
  return grid;
}

describe('ThumbnailGrid', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('snaps columns and thumbnails to whole pixels where 1fr tracks would be fractional', () => {
    // 1fr tracks would be (556 - 5 * 6) / 6 = 87.67 px wide here.
    const grid = gridCreate(572);
    const thumbnails = new ThumbnailGrid(grid, { minColumnPx: 84, gapPx: 6, tileChromePx: 10 });
    thumbnails.layout();
    expect(grid.style.gridTemplateColumns).toBe('repeat(6, 87px)');
    expect(grid.style.getPropertyValue(THUMBNAIL_GRID_SIZE_VARIABLE)).toBe('77px');
    expect(thumbnails.thumbnailPx()).toBe(77);
    thumbnails.dispose();
  });

  it('picks a thumbnail size that covers whole device pixels at 150%', () => {
    vi.stubGlobal('devicePixelRatio', 1.5);
    const grid = gridCreate(572);
    const thumbnails = new ThumbnailGrid(grid, { minColumnPx: 84, gapPx: 6, tileChromePx: 10 });
    thumbnails.layout();
    expect(thumbnails.thumbnailPx()).toBe(76);
    expect(grid.style.gridTemplateColumns).toBe('repeat(6, 86px)');
    expect(thumbnailGridSizeSnap(82, 1.5)).toBe(82);
    expect(thumbnailGridSizeSnap(83, 1.5)).toBe(82);
    expect(thumbnailGridSizeSnap(83, 1)).toBe(83);
    expect(thumbnailGridSizeSnap(83, 2)).toBe(83);
    thumbnails.dispose();
  });

  it('remembers the image of a thumbnail and forgets the drawing when it changes', () => {
    const thumb = thumbnailGridThumbCreate('x-thumb', 'blob:a', 'contain');
    expect(thumb.className).toContain('x-thumb');
    expect(thumb.dataset['thumbnailUrl']).toBe('blob:a');
    expect(thumb.dataset['thumbnailFit']).toBe('contain');
    thumb.dataset['thumbnailDrawn'] = 'old';
    thumb.appendChild(document.createElement('canvas'));
    thumbnailGridThumbSet(thumb, 'blob:a');
    expect(thumb.querySelector('canvas')).not.toBeNull();
    thumbnailGridThumbSet(thumb, null);
    expect(thumb.querySelector('canvas')).toBeNull();
    expect(thumb.dataset['thumbnailUrl']).toBeUndefined();
    expect(thumb.dataset['thumbnailDrawn']).toBeUndefined();
  });

  it('reports its columns and calls listeners after each layout', () => {
    const grid = gridCreate(572);
    const thumbnails = new ThumbnailGrid(grid, { minColumnPx: 84, gapPx: 6, tileChromePx: 10 });
    expect(thumbnails.columnCount()).toBe(0);
    expect(thumbnails.gapPx()).toBe(6);
    const seen: number[] = [];
    const stop = thumbnails.layoutListen(() => seen.push(thumbnails.columnCount()));
    thumbnails.layout();
    expect(seen).toEqual([6]);
    stop();
    thumbnails.layout();
    expect(seen).toEqual([6]);
    thumbnails.dispose();
  });

  it('decodes a thumbnail from its file and closes the full-size bitmap at once', async () => {
    const full = { width: 400, height: 200, close: vi.fn() };
    const small = { width: 77, height: 77, close: vi.fn() };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const make = vi.fn(async (_source: unknown, ..._rest: unknown[]) => (_source === file ? full : small));
    vi.stubGlobal('createImageBitmap', make);
    const file = new Blob(['png']);
    const grid = gridCreate(572);
    grid.appendChild(thumbnailGridThumbCreate('x', 'blob:from-file', 'cover', file));
    const thumbnails = new ThumbnailGrid(grid, { minColumnPx: 84, gapPx: 6, tileChromePx: 10 });
    thumbnails.layout();
    await vi.waitFor(() => expect(grid.querySelector('canvas')).not.toBeNull());
    expect(make.mock.calls[0]![0]).toBe(file);
    // A square from the middle of the wide image, resized to the thumbnail's device pixels.
    expect(make.mock.calls[1]).toEqual([
      full,
      100,
      0,
      200,
      200,
      { resizeWidth: 77, resizeHeight: 77, resizeQuality: 'high' },
    ]);
    expect(full.close).toHaveBeenCalledTimes(1);
    expect(small.close).not.toHaveBeenCalled();
    thumbnails.dispose();
  });

  it('draws nothing for a thumbnail that was released while its image was loading', async () => {
    let finish: (bitmap: unknown) => void = () => undefined;
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(() => new Promise((resolve) => (finish = resolve))),
    );
    const file = new Blob(['png']);
    const grid = gridCreate(572);
    const thumb = thumbnailGridThumbCreate('x', 'blob:released', 'cover', file);
    grid.appendChild(thumb);
    const thumbnails = new ThumbnailGrid(grid, { minColumnPx: 84, gapPx: 6, tileChromePx: 10 });
    thumbnails.layout();
    thumbnailGridTileRelease(thumb);
    finish({ width: 10, height: 10, close: vi.fn() });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(thumb.querySelector('canvas')).toBeNull();
    thumbnails.dispose();
  });
});
