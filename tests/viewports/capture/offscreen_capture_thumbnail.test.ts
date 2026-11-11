import { describe, expect, it } from 'vitest';
import { offscreenCaptureThumbnailCrop } from '@/viewports/capture/offscreen_capture_thumbnail.js';
import { offscreenCaptureLetterboxRect } from '@/viewports/capture/offscreen_capture_letterbox.js';

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

describe('offscreen capture letterbox', () => {
  it('fits a square thumbnail in the centre of a 1200 by 630 frame', () => {
    expect(offscreenCaptureLetterboxRect(256, 256, 1200, 630)).toEqual({
      x: 285,
      y: 0,
      width: 630,
      height: 630,
    });
  });

  it('fits a wide image with equal bars above and below', () => {
    expect(offscreenCaptureLetterboxRect(1200, 300, 1200, 630)).toEqual({
      x: 0,
      y: 165,
      width: 1200,
      height: 300,
    });
  });
});
