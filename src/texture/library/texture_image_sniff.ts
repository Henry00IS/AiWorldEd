/** Longest side, in pixels, of a texture image accepted from outside sources. */
export const TEXTURE_IMAGE_DIMENSION_MAXIMUM = 8192;

/** Image type and size read from a file's header. */
export interface TextureImageSniffed {
  mime: string;
  width: number;
  height: number;
}

/** Header reader for one raster format; null when the bytes are not that format. */
type TextureImageReader = (view: DataView) => TextureImageSniffed | null;

/**
 * Identifies a texture from outside (a room owner's stream, an embedded model
 * image) by its magic bytes and checks its size. Only PNG, JPEG, GIF, WebP and
 * BMP pass; any claimed mime type is ignored, so a source cannot hand over
 * HTML, SVG or scripts disguised as a texture, nor an image so large that
 * decoding it exhausts memory.
 *
 * @param bytes Image file.
 * @returns Detected type and size, or null when the file must be dropped.
 */
export function textureImageSniff(bytes: Uint8Array): TextureImageSniffed | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const readers: TextureImageReader[] = [
    textureImageReadPng,
    textureImageReadGif,
    textureImageReadBmp,
    textureImageReadWebp,
    textureImageReadJpeg,
  ];
  for (const reader of readers) {
    const sniffed = textureImageReadSafely(reader, view);
    if (sniffed !== null) return textureImageSizeAllowed(sniffed) ? sniffed : null;
  }
  return null;
}

/**
 * Runs a header reader, treating reads past the end as "not this format".
 *
 * @param reader Format reader.
 * @param view File bytes.
 * @returns Reader result, or null when the header is truncated.
 */
function textureImageReadSafely(reader: TextureImageReader, view: DataView): TextureImageSniffed | null {
  try {
    return reader(view);
  } catch {
    return null;
  }
}

/**
 * Tells whether a texture's size is positive and within the maximum.
 *
 * @param sniffed Detected image.
 * @returns True when both sides are between 1 and the maximum.
 */
function textureImageSizeAllowed(sniffed: TextureImageSniffed): boolean {
  const sides = [sniffed.width, sniffed.height];
  return sides.every((side) => Number.isInteger(side) && side >= 1 && side <= TEXTURE_IMAGE_DIMENSION_MAXIMUM);
}

/**
 * Tells whether the bytes at an offset spell an ASCII tag.
 *
 * @param view File bytes.
 * @param offset Start offset.
 * @param tag Expected ASCII text.
 * @returns True when every byte matches.
 */
function textureImageTagAt(view: DataView, offset: number, tag: string): boolean {
  if (offset + tag.length > view.byteLength) return false;
  for (let index = 0; index < tag.length; index++) {
    if (view.getUint8(offset + index) !== tag.charCodeAt(index)) return false;
  }
  return true;
}

/**
 * Reads a PNG header.
 *
 * @param view File bytes.
 * @returns Size from IHDR, or null.
 */
function textureImageReadPng(view: DataView): TextureImageSniffed | null {
  if (view.byteLength < 24 || view.getUint32(0) !== 0x89504e47 || view.getUint32(4) !== 0x0d0a1a0a) return null;
  if (!textureImageTagAt(view, 12, 'IHDR')) return null;
  return { mime: 'image/png', width: view.getUint32(16), height: view.getUint32(20) };
}

/**
 * Reads a GIF header.
 *
 * @param view File bytes.
 * @returns Logical screen size, or null.
 */
function textureImageReadGif(view: DataView): TextureImageSniffed | null {
  if (!textureImageTagAt(view, 0, 'GIF87a') && !textureImageTagAt(view, 0, 'GIF89a')) return null;
  return { mime: 'image/gif', width: view.getUint16(6, true), height: view.getUint16(8, true) };
}

/**
 * Reads a BMP header.
 *
 * @param view File bytes.
 * @returns Bitmap size, or null.
 */
function textureImageReadBmp(view: DataView): TextureImageSniffed | null {
  if (view.byteLength < 26 || !textureImageTagAt(view, 0, 'BM')) return null;
  return { mime: 'image/bmp', width: view.getInt32(18, true), height: Math.abs(view.getInt32(22, true)) };
}

/**
 * Reads a WebP header (lossy, lossless or extended).
 *
 * @param view File bytes.
 * @returns Canvas size, or null.
 */
function textureImageReadWebp(view: DataView): TextureImageSniffed | null {
  if (view.byteLength < 30 || !textureImageTagAt(view, 0, 'RIFF')) return null;
  if (!textureImageTagAt(view, 8, 'WEBP')) return null;
  const mime = 'image/webp';
  if (textureImageTagAt(view, 12, 'VP8 '))
    return { mime, width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
  if (textureImageTagAt(view, 12, 'VP8L')) {
    const bits = view.getUint32(21, true);
    return { mime, width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (!textureImageTagAt(view, 12, 'VP8X')) return null;
  const width = 1 + (view.getUint16(24, true) | (view.getUint8(26) << 16));
  return { mime, width, height: 1 + (view.getUint16(27, true) | (view.getUint8(29) << 16)) };
}

/**
 * Reads a JPEG header by walking its segments to the first frame header.
 *
 * @param view File bytes.
 * @returns Frame size, or null.
 */
function textureImageReadJpeg(view: DataView): TextureImageSniffed | null {
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8 || view.getUint8(2) !== 0xff) return null;
  let offset = 2;
  while (offset + 9 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) return null;
    const marker = view.getUint8(offset + 1);
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (textureImageJpegFrameMarker(marker))
      return { mime: 'image/jpeg', width: view.getUint16(offset + 7), height: view.getUint16(offset + 5) };
    offset += 2 + view.getUint16(offset + 2);
  }
  return null;
}

/**
 * Tells whether a JPEG marker starts a frame header (SOF0 to SOF15).
 *
 * @param marker Marker byte after 0xFF.
 * @returns True for SOF markers.
 */
function textureImageJpegFrameMarker(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

/**
 * Returns the file extension of image bytes from their magic bytes alone.
 *
 * @param bytes Image bytes.
 * @returns Png , "jpg", "gif", "webp" or "bmp", or null for other bytes.
 */
export function textureImageExtension(bytes: Uint8Array): string | null {
  const starts = (...signature: number[]) => signature.every((value, index) => bytes[index] === value);
  if (starts(0x89, 0x50, 0x4e, 0x47)) return 'png';
  if (starts(0xff, 0xd8, 0xff)) return 'jpg';
  if (starts(0x47, 0x49, 0x46, 0x38)) return 'gif';
  if (starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42) return 'webp';
  if (starts(0x42, 0x4d)) return 'bmp';
  return null;
}
