/** Longest side, in pixels, of a texture accepted from a room owner. */
export const TEXTURE_COLLABORATION_DIMENSION_MAXIMUM = 8192;

/** Image type and size read from a received file's header. */
export interface TextureCollaborationSniffed {
  mime: string;
  width: number;
  height: number;
}

/** Header reader for one raster format; null when the bytes are not that format. */
type TextureCollaborationReader = (view: DataView) => TextureCollaborationSniffed | null;

/**
 * Identifies a received texture by its magic bytes and checks its size. Only
 * PNG, JPEG, GIF, WebP and BMP pass; the owner's claimed mime type is ignored,
 * so a room owner cannot hand members HTML, SVG or scripts disguised as a
 * texture, nor an image so large that decoding it exhausts memory.
 *
 * @param bytes Received file.
 * @returns Detected type and size, or null when the file must be dropped.
 */
export function textureCollaborationSniff(bytes: Uint8Array): TextureCollaborationSniffed | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const readers: TextureCollaborationReader[] = [
    textureCollaborationReadPng,
    textureCollaborationReadGif,
    textureCollaborationReadBmp,
    textureCollaborationReadWebp,
    textureCollaborationReadJpeg,
  ];
  for (const reader of readers) {
    const sniffed = textureCollaborationReadSafely(reader, view);
    if (sniffed !== null) return textureCollaborationSizeAllowed(sniffed) ? sniffed : null;
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
function textureCollaborationReadSafely(
  reader: TextureCollaborationReader,
  view: DataView,
): TextureCollaborationSniffed | null {
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
function textureCollaborationSizeAllowed(sniffed: TextureCollaborationSniffed): boolean {
  const sides = [sniffed.width, sniffed.height];
  return sides.every((side) => Number.isInteger(side) && side >= 1 && side <= TEXTURE_COLLABORATION_DIMENSION_MAXIMUM);
}

/**
 * Tells whether the bytes at an offset spell an ASCII tag.
 *
 * @param view File bytes.
 * @param offset Start offset.
 * @param tag Expected ASCII text.
 * @returns True when every byte matches.
 */
function textureCollaborationTagAt(view: DataView, offset: number, tag: string): boolean {
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
function textureCollaborationReadPng(view: DataView): TextureCollaborationSniffed | null {
  if (view.byteLength < 24 || view.getUint32(0) !== 0x89504e47 || view.getUint32(4) !== 0x0d0a1a0a) return null;
  if (!textureCollaborationTagAt(view, 12, 'IHDR')) return null;
  return { mime: 'image/png', width: view.getUint32(16), height: view.getUint32(20) };
}

/**
 * Reads a GIF header.
 *
 * @param view File bytes.
 * @returns Logical screen size, or null.
 */
function textureCollaborationReadGif(view: DataView): TextureCollaborationSniffed | null {
  if (!textureCollaborationTagAt(view, 0, 'GIF87a') && !textureCollaborationTagAt(view, 0, 'GIF89a')) return null;
  return { mime: 'image/gif', width: view.getUint16(6, true), height: view.getUint16(8, true) };
}

/**
 * Reads a BMP header.
 *
 * @param view File bytes.
 * @returns Bitmap size, or null.
 */
function textureCollaborationReadBmp(view: DataView): TextureCollaborationSniffed | null {
  if (view.byteLength < 26 || !textureCollaborationTagAt(view, 0, 'BM')) return null;
  return { mime: 'image/bmp', width: view.getInt32(18, true), height: Math.abs(view.getInt32(22, true)) };
}

/**
 * Reads a WebP header (lossy, lossless or extended).
 *
 * @param view File bytes.
 * @returns Canvas size, or null.
 */
function textureCollaborationReadWebp(view: DataView): TextureCollaborationSniffed | null {
  if (view.byteLength < 30 || !textureCollaborationTagAt(view, 0, 'RIFF')) return null;
  if (!textureCollaborationTagAt(view, 8, 'WEBP')) return null;
  const mime = 'image/webp';
  if (textureCollaborationTagAt(view, 12, 'VP8 '))
    return { mime, width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
  if (textureCollaborationTagAt(view, 12, 'VP8L')) {
    const bits = view.getUint32(21, true);
    return { mime, width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (!textureCollaborationTagAt(view, 12, 'VP8X')) return null;
  const width = 1 + (view.getUint16(24, true) | (view.getUint8(26) << 16));
  return { mime, width, height: 1 + (view.getUint16(27, true) | (view.getUint8(29) << 16)) };
}

/**
 * Reads a JPEG header by walking its segments to the first frame header.
 *
 * @param view File bytes.
 * @returns Frame size, or null.
 */
function textureCollaborationReadJpeg(view: DataView): TextureCollaborationSniffed | null {
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8 || view.getUint8(2) !== 0xff) return null;
  let offset = 2;
  while (offset + 9 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) return null;
    const marker = view.getUint8(offset + 1);
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (textureCollaborationJpegFrameMarker(marker))
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
function textureCollaborationJpegFrameMarker(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}
