/** Request to encode one thumbnail. */
export interface OffscreenCaptureThumbnailWorkerRequest {
  id: number;
  bitmap: ImageBitmap;
}

/** Encoded thumbnail, or null when encoding failed. */
export interface OffscreenCaptureThumbnailWorkerReply {
  id: number;
  blob: Blob | null;
}

/** WebP quality of thumbnails. */
const OFFSCREEN_CAPTURE_THUMBNAIL_WORKER_QUALITY = 0.8;

/** The worker's own scope. */
const offscreenCaptureThumbnailWorkerScope = self as unknown as {
  onmessage: ((event: MessageEvent<OffscreenCaptureThumbnailWorkerRequest>) => void) | null;
  postMessage(message: OffscreenCaptureThumbnailWorkerReply): void;
};

/**
 * Encodes a bitmap as WebP off the main thread and closes the bitmap.
 *
 * @param bitmap Thumbnail pixels.
 * @returns Encoded image, or null when encoding failed.
 */
async function offscreenCaptureThumbnailWorkerEncode(bitmap: ImageBitmap): Promise<Blob | null> {
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
    return await canvas.convertToBlob({
      type: 'image/webp',
      quality: OFFSCREEN_CAPTURE_THUMBNAIL_WORKER_QUALITY,
    });
  } catch {
    return null;
  } finally {
    bitmap.close();
  }
}

offscreenCaptureThumbnailWorkerScope.onmessage = (event) => {
  const { id, bitmap } = event.data;
  void offscreenCaptureThumbnailWorkerEncode(bitmap).then((blob) =>
    offscreenCaptureThumbnailWorkerScope.postMessage({ id, blob }),
  );
};
