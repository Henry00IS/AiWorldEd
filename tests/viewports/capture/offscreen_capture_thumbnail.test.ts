import { describe, expect, it } from 'vitest';
import { offscreenCaptureThumbnailCrop } from '@/viewports/capture/offscreen_capture_thumbnail.js';

describe('offscreen capture thumbnail crop', () => {
  it('takes the centre square of the view in canvas pixels', () => {
    const bounds = new DOMRect(10, 20, 1000, 500);
    expect(offscreenCaptureThumbnailCrop(new DOMRect(510, 20, 500, 300), bounds, 2000)).toEqual({
      x: 1200,
      y: 0,
      side: 600,
    });
    expect(offscreenCaptureThumbnailCrop(new DOMRect(10, 20, 200, 400), bounds, 1000)).toEqual({
      x: 0,
      y: 100,
      side: 200,
    });
  });
});
