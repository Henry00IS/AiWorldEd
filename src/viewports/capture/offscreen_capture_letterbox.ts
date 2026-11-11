/** Width of a link preview image, the large Open Graph card size. */
export const OFFSCREEN_CAPTURE_LETTERBOX_WIDTH = 1200;

/** Height of a link preview image. */
export const OFFSCREEN_CAPTURE_LETTERBOX_HEIGHT = 630;

/** Background of the letterbox, the same grey as the views. */
export const OFFSCREEN_CAPTURE_LETTERBOX_BACKGROUND = '#232323';

/** Where a source image is drawn inside a letterbox frame. */
export interface OffscreenCaptureLetterboxRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Returns the rectangle that fits a source image inside a frame, centred, with
 * its aspect ratio kept.
 *
 * @param sourceWidth Source width in pixels.
 * @param sourceHeight Source height in pixels.
 * @param frameWidth Frame width in pixels.
 * @param frameHeight Frame height in pixels.
 * @returns Destination rectangle in the frame.
 */
export function offscreenCaptureLetterboxRect(
  sourceWidth: number,
  sourceHeight: number,
  frameWidth: number,
  frameHeight: number,
): OffscreenCaptureLetterboxRect {
  const scale = Math.min(frameWidth / sourceWidth, frameHeight / sourceHeight);
  const width = Math.round(sourceWidth * scale);
  const height = Math.round(sourceHeight * scale);
  return { x: Math.round((frameWidth - width) / 2), y: Math.round((frameHeight - height) / 2), width, height };
}

/**
 * Draws a bitmap into a 1200 by 630 PNG on the views' grey, then closes the
 * bitmap.
 *
 * @param bitmap Source image.
 * @returns PNG, or null when drawing or encoding failed.
 */
export async function offscreenCaptureLetterboxPng(bitmap: ImageBitmap): Promise<Blob | null> {
  try {
    return await offscreenCaptureLetterboxCanvas(bitmap).convertToBlob({ type: 'image/png' });
  } catch {
    return null;
  } finally {
    bitmap.close();
  }
}

/**
 * Draws a bitmap into a letterboxed off-screen canvas.
 *
 * @param bitmap Source image.
 * @returns Canvas holding the preview.
 */
function offscreenCaptureLetterboxCanvas(bitmap: ImageBitmap): OffscreenCanvas {
  const width = OFFSCREEN_CAPTURE_LETTERBOX_WIDTH;
  const height = OFFSCREEN_CAPTURE_LETTERBOX_HEIGHT;
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('no drawing context');
  context.fillStyle = OFFSCREEN_CAPTURE_LETTERBOX_BACKGROUND;
  context.fillRect(0, 0, width, height);
  const rect = offscreenCaptureLetterboxRect(bitmap.width, bitmap.height, width, height);
  context.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height);
  return canvas;
}

/**
 * Loads an image blob and letterboxes it to a 1200 by 630 PNG.
 *
 * @param image Source image.
 * @returns PNG, or null when the image cannot be read or drawn.
 */
export async function offscreenCaptureLetterboxBlob(image: Blob): Promise<Blob | null> {
  try {
    return await offscreenCaptureLetterboxPng(await createImageBitmap(image));
  } catch {
    return null;
  }
}
