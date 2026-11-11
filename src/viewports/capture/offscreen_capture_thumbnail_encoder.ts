import type {
  OffscreenCaptureThumbnailWorkerReply,
  OffscreenCaptureThumbnailWorkerRequest,
} from '@/viewports/capture/offscreen_capture_thumbnail_worker.js';

/**
 * Encodes thumbnails as WebP in a worker, so the main thread only hands over
 * the bitmap. Without worker support nothing is encoded.
 */
export class OffscreenCaptureThumbnailEncoder {
  private worker: Worker | null | undefined;
  private nextId = 1;
  private readonly waiting = new Map<number, (blob: Blob | null) => void>();

  /**
   * Encodes a bitmap and closes it.
   *
   * @param bitmap Thumbnail pixels; transferred to the worker.
   * @returns WebP image, or null when no worker could encode it.
   */
  encode(bitmap: ImageBitmap): Promise<Blob | null> {
    const worker = this.workerGet();
    if (worker === null) {
      bitmap.close();
      return Promise.resolve(null);
    }
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.waiting.set(id, resolve);
      const request: OffscreenCaptureThumbnailWorkerRequest = { id, bitmap };
      worker.postMessage(request, [bitmap]);
    });
  }

  /**
   * Starts the worker on first use.
   *
   * @returns Worker, or null when workers are not available.
   */
  private workerGet(): Worker | null {
    if (this.worker !== undefined) return this.worker;
    try {
      this.worker = new Worker(new URL('./offscreen_capture_thumbnail_worker.ts', import.meta.url), {
        type: 'module',
      });
      this.worker.onmessage = (event: MessageEvent<OffscreenCaptureThumbnailWorkerReply>) => this.reply(event.data);
      this.worker.onerror = () => this.fail();
    } catch {
      this.worker = null;
    }
    return this.worker;
  }

  /**
   * Hands an encoded image to its caller.
   *
   * @param reply Worker reply.
   */
  private reply(reply: OffscreenCaptureThumbnailWorkerReply): void {
    this.waiting.get(reply.id)?.(reply.blob);
    this.waiting.delete(reply.id);
  }

  /** Stops using a broken worker and answers every waiting caller with null. */
  private fail(): void {
    this.worker?.terminate();
    this.worker = null;
    this.waiting.forEach((resolve) => resolve(null));
    this.waiting.clear();
  }
}
