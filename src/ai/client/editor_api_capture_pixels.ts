/**
 * Max base64 character length for a capture image. Many MCP clients (including
 * Grok Build) cap tool results around 20KB; the image must leave room for JSON
 * metadata or the client truncates bytes and reports integrity failures.
 */
export const MCP_CAPTURE_MAX_BASE64_CHARS = 12000;

/** Default square capture resolution before optional client size override. */
export const MCP_CAPTURE_DEFAULT_SIZE = 256;

/** Encoded capture image ready for an MCP image content block. */
export interface EncodedCaptureImage {
  width: number;
  height: number;
  mimeType: 'image/jpeg' | 'image/png';
  base64: string;
  quality: number;
  byteLength: number;
  reducedFromRequested: boolean;
}

/**
 * Flips a tightly packed RGBA buffer vertically (WebGL bottom-left origin).
 *
 * @param source Bottom-up RGBA bytes from readRenderTargetPixels.
 * @param width Image width in pixels.
 * @param height Image height in pixels.
 * @returns Top-down RGBA bytes suitable for canvas ImageData.
 */
export function flipRgbaPixelsVertically(
  source: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  const rowBytes = width * 4;
  const output = new Uint8ClampedArray(source.length);
  for (let row = 0; row < height; row++) {
    const sourceOffset = row * rowBytes;
    const destOffset = (height - 1 - row) * rowBytes;
    output.set(source.subarray(sourceOffset, sourceOffset + rowBytes), destOffset);
  }
  return output;
}

/** Smallest square size tried when shrinking oversized captures. */
export const MCP_CAPTURE_MIN_SIZE = 32;

/**
 * Encodes capture RGBA into a JPEG small enough for typical MCP tool-result
 * caps. If still too large, halves resolution (512→256→128→64→32) and retries.
 * Gives up only after 32×32 still exceeds the budget.
 *
 * @param rgbaTopDown Top-down RGBA bytes at the source resolution.
 * @param sourceWidth Source width in pixels.
 * @param sourceHeight Source height in pixels.
 * @param requestedSize Preferred output size (square).
 * @param maxBase64Chars Maximum base64 length (default MCP-safe budget).
 * @param ownerDocument Document used to create canvases.
 * @returns Encoded JPEG under the budget when possible.
 */
export function encodeCaptureImageForMcp(
  rgbaTopDown: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  requestedSize: number,
  maxBase64Chars: number = MCP_CAPTURE_MAX_BASE64_CHARS,
  ownerDocument: Document = document,
): EncodedCaptureImage {
  const sourceCanvas = createCanvasFromRgba(rgbaTopDown, sourceWidth, sourceHeight, ownerDocument);
  const sizeCandidates = buildSizeCandidates(requestedSize);
  const qualityCandidates = [0.72, 0.55, 0.4, 0.28, 0.18];
  let lastValid: EncodedCaptureImage | null = null;
  for (const size of sizeCandidates) {
    for (const quality of qualityCandidates) {
      const encoded = tryEncodeJpegAtSize(sourceCanvas, size, quality, requestedSize, ownerDocument);
      if (!encoded) {
        continue;
      }
      lastValid = encoded;
      if (encoded.base64.length <= maxBase64Chars) {
        return encoded;
      }
    }
  }
  const detail = lastValid
    ? ` last attempt ${lastValid.width}×${lastValid.height} was ${lastValid.base64.length} base64 chars`
    : '';
  throw new Error(
    `capture_view failed: image still too large after shrinking to ${MCP_CAPTURE_MIN_SIZE}×${MCP_CAPTURE_MIN_SIZE}${detail}`,
  );
}

/**
 * Encodes capture RGBA as a lossless PNG at full resolution, without a size
 * budget (for captures delivered as links instead of inline images).
 *
 * @param rgbaTopDown Top-down RGBA bytes.
 * @param width Width in pixels.
 * @param height Height in pixels.
 * @param ownerDocument Document used to create the canvas.
 * @returns Encoded PNG.
 */
export function encodeCapturePng(
  rgbaTopDown: Uint8ClampedArray,
  width: number,
  height: number,
  ownerDocument: Document = document,
): EncodedCaptureImage {
  const canvas = createCanvasFromRgba(rgbaTopDown, width, height, ownerDocument);
  const base64 = stripDataUrlBase64Prefix(canvas.toDataURL('image/png'));
  return {
    width,
    height,
    mimeType: 'image/png',
    base64,
    quality: 1,
    byteLength: estimateDecodedByteLength(base64),
    reducedFromRequested: false,
  };
}

/**
 * Builds sizes by starting at the requested resolution and repeatedly halving
 * until 32 (e.g. 512 → 256 → 128 → 64 → 32).
 *
 * @param requestedSize Preferred size from the tool arguments.
 * @returns Descending power-of-two-style sizes down to 32.
 */
export function buildSizeCandidates(requestedSize: number): number[] {
  const start = clampCaptureResolution(requestedSize);
  const sizes: number[] = [];
  let size = start;
  while (size >= MCP_CAPTURE_MIN_SIZE) {
    sizes.push(size);
    if (size === MCP_CAPTURE_MIN_SIZE) {
      break;
    }
    size = Math.max(MCP_CAPTURE_MIN_SIZE, Math.floor(size / 2));
  }
  return sizes;
}

/**
 * Clamps capture resolution to a safe square size.
 *
 * @param size Requested size or undefined.
 * @returns Integer size between 32 and 512 (default 256).
 */
export function clampCaptureResolution(size: number | undefined): number {
  const fallback = MCP_CAPTURE_DEFAULT_SIZE;
  if (typeof size !== 'number' || !Number.isFinite(size)) {
    return fallback;
  }
  return Math.min(512, Math.max(MCP_CAPTURE_MIN_SIZE, Math.floor(size)));
}

/**
 * Encodes one JPEG attempt and returns null when the payload is invalid.
 *
 * @param sourceCanvas Full-resolution source canvas.
 * @param size Output square size.
 * @param quality JPEG quality 0–1.
 * @param requestedSize Original requested size for reducedFromRequested.
 * @param ownerDocument Owner document.
 * @returns Encoded image or null when invalid.
 */
function tryEncodeJpegAtSize(
  sourceCanvas: HTMLCanvasElement,
  size: number,
  quality: number,
  requestedSize: number,
  ownerDocument: Document,
): EncodedCaptureImage | null {
  const encoded = encodeJpegAtSize(sourceCanvas, size, quality, ownerDocument);
  if (!isValidJpegBase64(encoded.base64)) {
    return null;
  }
  return {
    ...encoded,
    reducedFromRequested: size < requestedSize || quality < 0.72,
  };
}

/**
 * Strips the data-URL prefix from a data URL, leaving raw base64.
 *
 * @param dataUrl Full data URL from canvas.toDataURL.
 * @returns Base64 payload without prefix.
 */
export function stripDataUrlBase64Prefix(dataUrl: string): string {
  const marker = 'base64,';
  const index = dataUrl.indexOf(marker);
  if (index < 0) {
    return dataUrl;
  }
  return dataUrl.slice(index + marker.length);
}

/**
 * Returns true when base64 decodes to a complete JPEG (SOI…EOI markers).
 *
 * @param base64 Base64 without data-URL prefix.
 * @returns True when the payload looks like a full JPEG.
 */
export function isValidJpegBase64(base64: string): boolean {
  if (base64.length < 8 || base64.length % 4 !== 0) {
    return false;
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    return false;
  }
  try {
    const binary = atob(base64);
    if (binary.length < 4) {
      return false;
    }
    const startOk = binary.charCodeAt(0) === 0xff && binary.charCodeAt(1) === 0xd8;
    const endOk = binary.charCodeAt(binary.length - 2) === 0xff && binary.charCodeAt(binary.length - 1) === 0xd9;
    return startOk && endOk;
  } catch {
    return false;
  }
}

/**
 * Creates a canvas filled with top-down RGBA pixels.
 *
 * @param rgbaTopDown RGBA bytes.
 * @param width Width in pixels.
 * @param height Height in pixels.
 * @param ownerDocument Owner document.
 * @returns Canvas with image data drawn.
 */
function createCanvasFromRgba(
  rgbaTopDown: Uint8ClampedArray,
  width: number,
  height: number,
  ownerDocument: Document,
): HTMLCanvasElement {
  const canvas = ownerDocument.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not create 2D canvas context for capture encode');
  }
  const pixels = new Uint8ClampedArray(rgbaTopDown.length);
  pixels.set(rgbaTopDown);
  context.putImageData(new ImageData(pixels, width, height), 0, 0);
  return canvas;
}

/**
 * Draws the source canvas into a square JPEG at the given size and quality.
 *
 * @param sourceCanvas Full-resolution source.
 * @param size Output square size.
 * @param quality JPEG quality 0–1.
 * @param ownerDocument Owner document.
 * @returns Encoded JPEG fields without the reducedFromRequested flag.
 */
function encodeJpegAtSize(
  sourceCanvas: HTMLCanvasElement,
  size: number,
  quality: number,
  ownerDocument: Document,
): Omit<EncodedCaptureImage, 'reducedFromRequested'> {
  const canvas = ownerDocument.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not create 2D canvas context for capture resize');
  }
  context.fillStyle = '#232323';
  context.fillRect(0, 0, size, size);
  context.drawImage(sourceCanvas, 0, 0, size, size);
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  const base64 = stripDataUrlBase64Prefix(dataUrl);
  return {
    width: size,
    height: size,
    mimeType: 'image/jpeg',
    base64,
    quality,
    byteLength: estimateDecodedByteLength(base64),
  };
}

/**
 * Estimates decoded binary length from base64 length.
 *
 * @param base64 Base64 string.
 * @returns Approximate byte length.
 */
function estimateDecodedByteLength(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}
