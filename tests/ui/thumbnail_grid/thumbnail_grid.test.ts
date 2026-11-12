import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  THUMBNAIL_GRID_SIZE_VARIABLE,
  ThumbnailGrid,
  thumbnailGridSizeSnap,
  thumbnailGridThumbCreate,
  thumbnailGridThumbSet,
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
});
