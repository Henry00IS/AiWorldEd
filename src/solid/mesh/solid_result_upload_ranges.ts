import type * as THREE from 'three';

/** Result geometry attribute that receives GPU upload windows. */
type SolidResultUploadAttribute = THREE.BufferAttribute | THREE.InterleavedBufferAttribute;

/** Upload window list and its edit methods, when the attribute offers them. */
interface SolidResultUploadRangeOwner {
  updateRanges?: Array<{ start: number; count: number }>;
  addUpdateRange?: (start: number, count: number) => void;
  clearUpdateRanges?: () => void;
}

/**
 * Queues GPU upload windows on result geometry attributes. Windows that are
 * still waiting for the renderer are kept, because the renderer uploads only
 * the windows it finds at draw time and then forgets them: two result writes
 * between two frames must both reach the GPU. A whole-buffer write queues one
 * window over the entire array, so a later partial write in the same frame
 * cannot shrink it to that partial window.
 */
export class SolidResultUploadRanges {
  /** Waiting windows above which the whole buffer is queued instead. */
  static readonly maximumWaitingWindows = 64;

  /**
   * Queues one partial window next to every window still waiting for upload.
   *
   * @param attribute Geometry attribute that was written.
   * @param start First written float index.
   * @param count Number of written floats.
   */
  static queueWindow(attribute: SolidResultUploadAttribute, start: number, count: number): void {
    const owner = attribute as unknown as SolidResultUploadRangeOwner;
    const waiting = owner.updateRanges?.length ?? 0;
    if (waiting >= SolidResultUploadRanges.maximumWaitingWindows) {
      SolidResultUploadRanges.queueWholeBuffer(attribute);
      return;
    }
    owner.addUpdateRange?.(start, count);
    attribute.needsUpdate = true;
  }

  /**
   * Queues the entire attribute array as one window, replacing waiting windows
   * that it covers.
   *
   * @param attribute Geometry attribute that was rewritten.
   */
  static queueWholeBuffer(attribute: SolidResultUploadAttribute): void {
    const owner = attribute as unknown as SolidResultUploadRangeOwner;
    owner.clearUpdateRanges?.();
    owner.addUpdateRange?.(0, attribute.array.length);
    attribute.needsUpdate = true;
  }
}
