/** CPU copy of an image in display (sRGB) space, RGBA bytes. */
export interface PaintImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray | Uint8Array;
}

/** Resolves texture ids to CPU images. */
export interface PaintImageSource {
  /**
   * Returns the image of a texture.
   *
   * @param textureId Texture id.
   * @returns Image, or null while it is not available.
   */
  image(textureId: string): PaintImage | null;
  /**
   * Checks whether images that were not available have become available, and
   * bumps {@link version} when one did. Called once per frame.
   */
  prepare?(): void;
  /** Changes whenever an image that was not available becomes available. */
  readonly version?: number;
}

/** An image source that never has images. */
export const PAINT_IMAGE_SOURCE_NONE: PaintImageSource = { image: () => null };

/**
 * Samples an image bilinearly with repeat wrapping.
 *
 * @param image Image.
 * @param u Horizontal coordinate, 0..1 spans the image left to right.
 * @param v Vertical coordinate, 0..1 spans the image bottom to top.
 * @param target Receives r, g, b, a in 0..1.
 */
export function paintImageSample(image: PaintImage, u: number, v: number, target: Float32Array): void {
  const x = (u - Math.floor(u)) * image.width - 0.5;
  const y = (1 - (v - Math.floor(v))) * image.height - 0.5;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  for (let channel = 0; channel < 4; channel++) {
    const top = paintImageTexel(image, x0, y0, channel) * (1 - fx) + paintImageTexel(image, x0 + 1, y0, channel) * fx;
    const bottom =
      paintImageTexel(image, x0, y0 + 1, channel) * (1 - fx) + paintImageTexel(image, x0 + 1, y0 + 1, channel) * fx;
    target[channel] = (top * (1 - fy) + bottom * fy) / 255;
  }
}

/**
 * Reads one channel of a texel with repeat wrapping.
 *
 * @param image Image.
 * @param x Texel x (any integer).
 * @param y Texel y (any integer).
 * @param channel Channel 0..3.
 * @returns Byte value.
 */
function paintImageTexel(image: PaintImage, x: number, y: number, channel: number): number {
  const wrappedX = ((x % image.width) + image.width) % image.width;
  const wrappedY = ((y % image.height) + image.height) % image.height;
  return image.data[(wrappedY * image.width + wrappedX) * 4 + channel] ?? 0;
}

/**
 * Returns the brightness of an RGBA sample, weighted by its alpha.
 *
 * @param sample RGBA in 0..1.
 * @returns Masking value 0..1.
 */
export function paintImageMaskValue(sample: Float32Array): number {
  const luminance = 0.2126 * (sample[0] ?? 0) + 0.7152 * (sample[1] ?? 0) + 0.0722 * (sample[2] ?? 0);
  return luminance * (sample[3] ?? 0);
}
