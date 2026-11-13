/** Request to encode one thumbnail. */
export interface ProjectHistoryThumbnailWorkerRequest {
  id: number;
  bitmap: ImageBitmap;
}

/** Encoded thumbnail, or null when encoding failed. */
export interface ProjectHistoryThumbnailWorkerReply {
  id: number;
  blob: Blob | null;
}

/** WebP quality of thumbnails. */
const PROJECT_HISTORY_THUMBNAIL_WORKER_QUALITY = 0.8;

/** The worker's own scope. */
const projectHistoryThumbnailWorkerScope = self as unknown as {
  onmessage: ((event: MessageEvent<ProjectHistoryThumbnailWorkerRequest>) => void) | null;
  postMessage(message: ProjectHistoryThumbnailWorkerReply): void;
};

/**
 * Encodes a bitmap as WebP off the main thread and closes the bitmap.
 *
 * @param bitmap Thumbnail pixels.
 * @returns Encoded image, or null when encoding failed.
 */
async function projectHistoryThumbnailWorkerEncode(bitmap: ImageBitmap): Promise<Blob | null> {
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
    return await canvas.convertToBlob({ type: 'image/webp', quality: PROJECT_HISTORY_THUMBNAIL_WORKER_QUALITY });
  } catch {
    return null;
  } finally {
    bitmap.close();
  }
}

projectHistoryThumbnailWorkerScope.onmessage = (event) => {
  const { id, bitmap } = event.data;
  void projectHistoryThumbnailWorkerEncode(bitmap).then((blob) =>
    projectHistoryThumbnailWorkerScope.postMessage({ id, blob }),
  );
};
