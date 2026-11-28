/**
 * What an image manager entry can hold: a small preview, the decoded image, GPU
 * uploads.
 */
export type ImageManagerLevel = 'thumbnail' | 'full' | 'gpu';

/** Every level, from the smallest. */
export const IMAGE_MANAGER_LEVELS: readonly ImageManagerLevel[] = ['thumbnail', 'full', 'gpu'];

/**
 * Budget of decoded images and thumbnails in RAM; unused ones beyond it are
 * dropped, oldest first.
 */
export const IMAGE_MANAGER_RAM_BUDGET_BYTES = 1024 * 1024 * 1024;

/**
 * Budget of GPU textures (all WebGL contexts); unused ones beyond it are freed,
 * oldest first.
 */
export const IMAGE_MANAGER_VRAM_BUDGET_BYTES = 2 * 1024 * 1024 * 1024;

/**
 * Thumbnails are made with their short side this long (never larger than the
 * image).
 */
export const IMAGE_MANAGER_THUMBNAIL_PX = 256;

/** Thumbnails never get a longer side than this (very long images). */
export const IMAGE_MANAGER_THUMBNAIL_LONG_PX = 1024;

/** State of one level of an entry. */
export type ImageManagerLevelState = 'empty' | 'loading' | 'ready' | 'failed';

/** Where an image comes from and how to read it again. */
export interface ImageManagerSource {
  /** Readable name (file name, texture name). */
  name: string;
  /** Kind of source: project file, embedded texture, room owner… */
  origin: string;
  /** The compressed file; read again whenever a level must be rebuilt. */
  blob: Blob;
  /** Object URL of the blob (the manager does not own it). */
  url: string;
  /**
   * Content hash (SHA-256) when known; thumbnails are shared between files with
   * the same hash.
   */
  hash?: () => string | undefined;
}

/** A decoded full image. */
export type ImageManagerFullImage = HTMLImageElement | ImageBitmap;

/** A thumbnail: a small compressed image plus the sizes it was made from. */
export interface ImageManagerThumbnail {
  /** WebP (PNG where WebP cannot be encoded). */
  blob: Blob;
  width: number;
  height: number;
  /** Size of the image it shows. */
  sourceWidth: number;
  sourceHeight: number;
}

/** One GPU upload of an image (a THREE.Texture showing it). */
export interface ImageManagerGpuUpload {
  /** Whether the upload carries a mip chain (4/3 of the base level). */
  mipmaps: boolean;
  /** Frees the upload in every renderer (THREE.Texture.dispose()). */
  dispose: () => void;
}

/** Row of the Debug Menu's image handle list. */
export interface ImageManagerEntryInfo {
  key: string;
  hash: string | undefined;
  name: string;
  origin: string;
  /** False once the library let go of the file (the entry ends when unused). */
  sourced: boolean;
  width: number;
  height: number;
  levels: Record<ImageManagerLevel, { users: number; state: ImageManagerLevelState; bytes: number }>;
  /** True when it holds data but nobody uses it (it waits in the unused pool). */
  pooled: boolean;
  lastUsedMs: number;
}

/** Byte ledger of the manager. All GPU figures are estimates. */
export interface ImageManagerLedger {
  entries: number;
  thumbnailBytes: number;
  /** Thumbnails kept by content hash after their file was gone. */
  thumbnailCacheBytes: number;
  fullBytes: number;
  /** Estimated GPU bytes for one WebGL context. */
  gpuBytesPerContext: number;
  contexts: number;
  /** Estimated GPU bytes for all contexts. */
  gpuBytes: number;
  /** Bytes held by data nobody uses (unused pool). */
  pooledRamBytes: number;
  pooledGpuBytes: number;
  ramBudgetBytes: number;
  vramBudgetBytes: number;
  evictions: number;
}

/**
 * Estimates the bytes of an RGBA8 image.
 *
 * @param width Width in pixels.
 * @param height Height in pixels.
 * @param mipmaps Whether a full mip chain is added (4/3).
 * @returns Bytes.
 */
export function imageManagerRgbaBytes(width: number, height: number, mipmaps = false): number {
  const base = Math.max(0, width) * Math.max(0, height) * 4;
  return mipmaps ? Math.ceil((base * 4) / 3) : base;
}

/**
 * Returns the size of a thumbnail: short side
 * {@link IMAGE_MANAGER_THUMBNAIL_PX}, long side at most
 * {@link IMAGE_MANAGER_THUMBNAIL_LONG_PX}, never enlarged.
 *
 * @param width Image width.
 * @param height Image height.
 * @returns Thumbnail size.
 */
export function imageManagerThumbnailSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(
    1,
    IMAGE_MANAGER_THUMBNAIL_PX / Math.max(1, Math.min(width, height)),
    IMAGE_MANAGER_THUMBNAIL_LONG_PX / Math.max(1, Math.max(width, height)),
  );
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
