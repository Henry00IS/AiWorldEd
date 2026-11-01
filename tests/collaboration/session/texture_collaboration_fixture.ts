/** Image headers for texture transfer tests. */

/**
 * Builds a PNG signature and IHDR header for a size.
 *
 * @param width Image width.
 * @param height Image height.
 * @returns Header bytes.
 */
export function pngHeaderCreate(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  const view = new DataView(bytes.buffer);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}
