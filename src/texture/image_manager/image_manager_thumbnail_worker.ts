/**
 * Request to make one thumbnail: from a compressed file, or from pixels already
 * resized.
 */
export interface ImageManagerThumbnailWorkerRequest {
  id: number;
  /** File to decode and shrink in the worker. */
  blob?: Blob;
  /** Pixels already at thumbnail size (only encoded here); transferred. */
  bitmap?: ImageBitmap;
  /** Size of the image the bitmap was made from. */
  sourceWidth?: number;
  sourceHeight?: number;
}

/** Thumbnail made, or null when the image could not be decoded or encoded. */
export interface ImageManagerThumbnailWorkerReply {
  id: number;
  thumbnail: {
    blob: Blob;
    width: number;
    height: number;
    sourceWidth: number;
    sourceHeight: number;
  } | null;
}

/**
 * Short side of a thumbnail (as IMAGE_MANAGER_THUMBNAIL_PX; workers import
 * nothing).
 */
const IMAGE_MANAGER_THUMBNAIL_WORKER_PX = 256;
/** Longest side of a thumbnail (as IMAGE_MANAGER_THUMBNAIL_LONG_PX). */
const IMAGE_MANAGER_THUMBNAIL_WORKER_LONG_PX = 1024;
/** WebP quality of thumbnails. */
const IMAGE_MANAGER_THUMBNAIL_WORKER_QUALITY = 0.85;

/** The worker's own scope. */
const imageManagerThumbnailWorkerScope = self as unknown as {
  onmessage: ((event: MessageEvent<ImageManagerThumbnailWorkerRequest>) => void) | null;
  postMessage(message: ImageManagerThumbnailWorkerReply): void;
};

/**
 * Decodes a file and shrinks it to thumbnail size, closing the full decode at
 * once.
 *
 * @param blob Image file.
 * @returns Thumbnail pixels and the image size.
 */
async function imageManagerThumbnailWorkerShrink(
  blob: Blob,
): Promise<{ bitmap: ImageBitmap; sourceWidth: number; sourceHeight: number }> {
  const full = await createImageBitmap(blob);
  try {
    const { width, height } = full;
    const scale = Math.min(
      1,
      IMAGE_MANAGER_THUMBNAIL_WORKER_PX / Math.max(1, Math.min(width, height)),
      IMAGE_MANAGER_THUMBNAIL_WORKER_LONG_PX / Math.max(1, Math.max(width, height)),
    );
    const bitmap = await createImageBitmap(full, {
      resizeWidth: Math.max(1, Math.round(width * scale)),
      resizeHeight: Math.max(1, Math.round(height * scale)),
      resizeQuality: 'high',
    });
    return { bitmap, sourceWidth: width, sourceHeight: height };
  } finally {
    full.close();
  }
}

/**
 * Encodes thumbnail pixels as WebP, or PNG where the browser cannot encode WebP
 * (it then returns another type), and closes the bitmap.
 *
 * @param bitmap Thumbnail pixels.
 * @returns Encoded image.
 */
async function imageManagerThumbnailWorkerEncode(bitmap: ImageBitmap): Promise<Blob> {
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
    const webp = await canvas.convertToBlob({ type: 'image/webp', quality: IMAGE_MANAGER_THUMBNAIL_WORKER_QUALITY });
    return webp.type === 'image/webp' ? webp : await canvas.convertToBlob({ type: 'image/png' });
  } finally {
    bitmap.close();
  }
}

/**
 * Makes one thumbnail.
 *
 * @param request Request.
 * @returns Reply.
 */
async function imageManagerThumbnailWorkerMake(
  request: ImageManagerThumbnailWorkerRequest,
): Promise<ImageManagerThumbnailWorkerReply> {
  try {
    const shrunk =
      request.bitmap !== undefined
        ? {
            bitmap: request.bitmap,
            sourceWidth: request.sourceWidth ?? request.bitmap.width,
            sourceHeight: request.sourceHeight ?? request.bitmap.height,
          }
        : await imageManagerThumbnailWorkerShrink(request.blob!);
    const { width, height } = shrunk.bitmap;
    const blob = await imageManagerThumbnailWorkerEncode(shrunk.bitmap);
    return {
      id: request.id,
      thumbnail: { blob, width, height, sourceWidth: shrunk.sourceWidth, sourceHeight: shrunk.sourceHeight },
    };
  } catch {
    request.bitmap?.close();
    return { id: request.id, thumbnail: null };
  }
}

imageManagerThumbnailWorkerScope.onmessage = (event) => {
  void imageManagerThumbnailWorkerMake(event.data).then((reply) => imageManagerThumbnailWorkerScope.postMessage(reply));
};
