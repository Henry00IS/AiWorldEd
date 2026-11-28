import type {
  ImageManagerThumbnailWorkerReply,
  ImageManagerThumbnailWorkerRequest,
} from './image_manager_thumbnail_worker.js';
import {
  imageManagerThumbnailSize,
  type ImageManagerFullImage,
  type ImageManagerThumbnail,
} from './image_manager_types.js';

/**
 * Makes a thumbnail from a file, or from a full image already decoded (reused,
 * not decoded again).
 */
export type ImageManagerThumbnailMake = (
  blob: Blob,
  full: ImageManagerFullImage | null,
) => Promise<ImageManagerThumbnail | null>;

/**
 * Makes thumbnails off the main thread: a worker decodes the file, shrinks it
 * (createImageBitmap) and encodes it (OffscreenCanvas.convertToBlob, WebP with
 * a PNG fallback), so the main thread never holds the full image. A full image
 * that is decoded anyway is shrunk by the browser and only encoded in the
 * worker. Without workers or OffscreenCanvas (older WebKit) the same is done on
 * the main thread; without createImageBitmap there are no thumbnails.
 */
export class ImageManagerThumbnailMaker {
  private worker: Worker | null | undefined;
  private nextId = 1;
  private readonly waiting = new Map<number, (reply: ImageManagerThumbnailWorkerReply['thumbnail']) => void>();

  /** Makes a thumbnail; see {@link ImageManagerThumbnailMake}. */
  readonly make: ImageManagerThumbnailMake = async (blob, full) => {
    if (typeof createImageBitmap !== 'function') return null;
    try {
      if (full !== null) {
        const sourceWidth = imageManagerFullWidth(full);
        const sourceHeight = imageManagerFullHeight(full);
        const size = imageManagerThumbnailSize(sourceWidth, sourceHeight);
        const bitmap = await createImageBitmap(full, {
          resizeWidth: size.width,
          resizeHeight: size.height,
          resizeQuality: 'high',
        });
        return await this.post({ id: 0, bitmap, sourceWidth, sourceHeight }, [bitmap]);
      }
      return await this.post({ id: 0, blob }, []);
    } catch {
      return null;
    }
  };

  /** Stops the worker. */
  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.waiting.forEach((resolve) => resolve(null));
    this.waiting.clear();
  }

  /**
   * Hands a request to the worker, or does it on the main thread without one.
   *
   * @param request Request (its id is set here).
   * @param transfer Objects to transfer.
   * @returns Thumbnail, or null.
   */
  private post(
    request: ImageManagerThumbnailWorkerRequest,
    transfer: Transferable[],
  ): Promise<ImageManagerThumbnail | null> {
    const worker = this.workerGet();
    if (worker === null) return imageManagerThumbnailMainThread(request);
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.waiting.set(id, resolve);
      worker.postMessage({ ...request, id }, transfer);
    });
  }

  /**
   * Starts the worker on first use.
   *
   * @returns Worker, or null when workers or OffscreenCanvas are not available.
   */
  private workerGet(): Worker | null {
    if (this.worker !== undefined) return this.worker;
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return (this.worker = null);
    try {
      this.worker = new Worker(new URL('./image_manager_thumbnail_worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (event: MessageEvent<ImageManagerThumbnailWorkerReply>) => {
        this.waiting.get(event.data.id)?.(event.data.thumbnail);
        this.waiting.delete(event.data.id);
      };
      this.worker.onerror = () => this.dispose();
    } catch {
      this.worker = null;
    }
    return this.worker;
  }
}

/**
 * Makes a thumbnail on the main thread (no worker): decode and shrink with
 * createImageBitmap, encode with a canvas.
 *
 * @param request Request.
 * @returns Thumbnail, or null.
 */
async function imageManagerThumbnailMainThread(
  request: ImageManagerThumbnailWorkerRequest,
): Promise<ImageManagerThumbnail | null> {
  let bitmap = request.bitmap ?? null;
  try {
    let sourceWidth = request.sourceWidth ?? bitmap?.width ?? 0;
    let sourceHeight = request.sourceHeight ?? bitmap?.height ?? 0;
    if (bitmap === null) {
      const full = await createImageBitmap(request.blob!);
      sourceWidth = full.width;
      sourceHeight = full.height;
      const size = imageManagerThumbnailSize(full.width, full.height);
      try {
        bitmap = await createImageBitmap(full, {
          resizeWidth: size.width,
          resizeHeight: size.height,
          resizeQuality: 'high',
        });
      } finally {
        full.close();
      }
    }
    const blob = await imageManagerCanvasEncode(bitmap);
    if (blob === null) return null;
    return { blob, width: bitmap.width, height: bitmap.height, sourceWidth, sourceHeight };
  } catch {
    return null;
  } finally {
    bitmap?.close();
  }
}

/**
 * Encodes pixels with a canvas: WebP, or PNG where WebP is not supported.
 *
 * @param bitmap Pixels.
 * @returns Encoded image, or null.
 */
async function imageManagerCanvasEncode(bitmap: ImageBitmap): Promise<Blob | null> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
    const webp = await canvas.convertToBlob({ type: 'image/webp', quality: 0.85 });
    return webp.type === 'image/webp' ? webp : canvas.convertToBlob({ type: 'image/png' });
  }
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d');
  if (context === null) return null;
  context.drawImage(bitmap, 0, 0);
  const encode = (type: string): Promise<Blob | null> =>
    new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), type, 0.85));
  const webp = await encode('image/webp');
  return webp?.type === 'image/webp' ? webp : encode('image/png');
}

/**
 * Returns a full image's width.
 *
 * @param image Image.
 * @returns Width in pixels.
 */
export function imageManagerFullWidth(image: ImageManagerFullImage): number {
  return 'naturalWidth' in image ? image.naturalWidth || image.width : image.width;
}

/**
 * Returns a full image's height.
 *
 * @param image Image.
 * @returns Height in pixels.
 */
export function imageManagerFullHeight(image: ImageManagerFullImage): number {
  return 'naturalHeight' in image ? image.naturalHeight || image.height : image.height;
}
