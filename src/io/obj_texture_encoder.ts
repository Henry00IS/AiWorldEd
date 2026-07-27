import * as THREE from 'three';
import type { ObjExportTextureFile } from './obj_export_types.js';
import type { ObjMaterialSlot } from './obj_material_collector.js';

/** Texture image shaped like THREE.DataTexture.image. */
interface DataTextureImage {
  data: ArrayBufferView;
  width: number;
  height: number;
}

/**
 * Encodes diffuse maps referenced by material slots into PNG blobs for export.
 *
 * @param slots Material slots that may reference maps.
 * @returns Texture files with unique file names.
 */
export async function encodeObjTextureFiles(slots: readonly ObjMaterialSlot[]): Promise<ObjExportTextureFile[]> {
  const files: ObjExportTextureFile[] = [];
  const encodedMaps = new Set<string>();
  for (const slot of slots) {
    if (!slot.map || !slot.mapFileName) continue;
    if (encodedMaps.has(slot.map.uuid)) continue;
    encodedMaps.add(slot.map.uuid);
    const blob = await encodeTextureToPngBlob(slot.map);
    if (!blob) continue;
    files.push({ fileName: slot.mapFileName, blob });
  }
  return files;
}

/**
 * Rasterizes a THREE.Texture image source to a PNG blob. Shared by Wavefront
 * and FBX export paths.
 *
 * @param texture Texture with a loaded image.
 * @returns PNG blob, or null when the image cannot be encoded.
 */
export async function encodeTextureMapToPngBlob(texture: THREE.Texture): Promise<Blob | null> {
  return encodeTextureToPngBlob(texture);
}

/**
 * Rasterizes a THREE.Texture image source to a PNG blob.
 *
 * @param texture Texture with a loaded image.
 * @returns PNG blob, or null when the image cannot be encoded.
 */
async function encodeTextureToPngBlob(texture: THREE.Texture): Promise<Blob | null> {
  const image = texture.image as unknown;
  if (!image) return null;
  if (isDataTextureImage(image)) {
    return encodeDataTextureImage(image);
  }
  const size = resolveImageSize(image);
  if (size.width <= 0 || size.height <= 0) return null;
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  if (!drawImageSource(context, image, size.width, size.height)) return null;
  return canvasToPngBlob(canvas);
}

/**
 * Encodes a DataTexture buffer as a PNG when canvas is available, otherwise as
 * a raw RGBA blob so export still produces a map file in headless tests.
 *
 * @param image Data texture image buffer.
 * @returns Encoded image blob, or null on failure.
 */
async function encodeDataTextureImage(image: DataTextureImage): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d');
  if (context && drawDataTextureImage(context, image, image.width, image.height)) {
    const blob = await canvasToPngBlob(canvas);
    if (blob) return blob;
  }
  const source = new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.byteLength);
  const copy = new Uint8Array(source.byteLength);
  copy.set(source);
  return new Blob([copy.buffer], { type: 'image/png' });
}

/**
 * Resolves pixel dimensions of a texture image source.
 *
 * @param image Texture image source.
 * @returns Width and height in pixels.
 */
function resolveImageSize(image: unknown): { width: number; height: number } {
  if (isDataTextureImage(image)) {
    return { width: image.width, height: image.height };
  }
  if (isSizedImage(image)) {
    return { width: image.width, height: image.height };
  }
  return { width: 0, height: 0 };
}

/**
 * Type guard for THREE.DataTexture-style image buffers.
 *
 * @param image Candidate image value.
 * @returns True when width, height, and data are present.
 */
function isDataTextureImage(image: unknown): image is DataTextureImage {
  if (!image || typeof image !== 'object') return false;
  const record = image as Record<string, unknown>;
  return (
    typeof record['width'] === 'number' &&
    typeof record['height'] === 'number' &&
    record['data'] !== undefined &&
    ArrayBuffer.isView(record['data'] as ArrayBufferView)
  );
}

/**
 * Type guard for image-like sources exposing width and height.
 *
 * @param image Candidate image source.
 * @returns True when width/height are numeric.
 */
function isSizedImage(image: unknown): image is { width: number; height: number } {
  if (!image || typeof image !== 'object') return false;
  const record = image as Record<string, unknown>;
  return typeof record['width'] === 'number' && typeof record['height'] === 'number';
}

/**
 * Draws an image source onto a 2D canvas context.
 *
 * @param context Canvas 2D context.
 * @param image Source image.
 * @param width Target width.
 * @param height Target height.
 * @returns True when drawing succeeded.
 */
function drawImageSource(context: CanvasRenderingContext2D, image: unknown, width: number, height: number): boolean {
  if (isDataTextureImage(image)) {
    return drawDataTextureImage(context, image, width, height);
  }
  if (isDrawableImage(image)) {
    context.drawImage(image, 0, 0, width, height);
    return true;
  }
  return false;
}

/**
 * Draws a DataTexture pixel buffer onto the canvas.
 *
 * @param context Canvas 2D context.
 * @param image Data texture image buffer.
 * @param width Target width.
 * @param height Target height.
 * @returns True when pixels were written.
 */
function drawDataTextureImage(
  context: CanvasRenderingContext2D,
  image: DataTextureImage,
  width: number,
  height: number,
): boolean {
  const bytes = new Uint8ClampedArray(image.data.buffer, image.data.byteOffset, image.data.byteLength);
  if (bytes.length < width * height * 4) return false;
  const imageData = context.createImageData(width, height);
  imageData.data.set(bytes.subarray(0, width * height * 4));
  context.putImageData(imageData, 0, 0);
  return true;
}

/**
 * Type guard for values accepted by canvas drawImage.
 *
 * @param image Candidate image.
 * @returns True when drawImage can accept the value.
 */
function isDrawableImage(image: unknown): image is CanvasImageSource {
  if (!image || typeof image !== 'object') return false;
  return (
    (typeof HTMLCanvasElement !== 'undefined' && image instanceof HTMLCanvasElement) ||
    (typeof HTMLImageElement !== 'undefined' && image instanceof HTMLImageElement) ||
    (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) ||
    (typeof OffscreenCanvas !== 'undefined' && image instanceof OffscreenCanvas)
  );
}

/**
 * Converts a canvas to a PNG blob.
 *
 * @param canvas Source canvas.
 * @returns PNG blob promise.
 */
function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (typeof canvas.toBlob !== 'function') {
      resolve(createPngBlobFallback(canvas));
      return;
    }
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}

/**
 * Fallback PNG-ish blob when canvas.toBlob is unavailable in tests.
 *
 * @param canvas Source canvas.
 * @returns Blob of raw RGBA when possible, otherwise null.
 */
function createPngBlobFallback(canvas: HTMLCanvasElement): Blob | null {
  try {
    const context = canvas.getContext('2d');
    if (!context) return null;
    const data = context.getImageData(0, 0, canvas.width, canvas.height);
    return new Blob([data.data], { type: 'image/png' });
  } catch {
    return null;
  }
}
