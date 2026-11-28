import type {
  ImageManagerEntryInfo,
  ImageManagerFullImage,
  ImageManagerGpuUpload,
  ImageManagerLevel,
  ImageManagerLevelState,
  ImageManagerSource,
  ImageManagerThumbnail,
} from './image_manager_types.js';

/** Something the RAM budget may drop: its bytes, last use and how to drop it. */
export interface ImageManagerEvictCandidate {
  lastUsedMs: number;
  bytes: number;
  drop: () => void;
}

/** One level of an entry. */
export interface ImageManagerSlot<T> {
  users: number;
  state: ImageManagerLevelState;
  value: T | null;
  bytes: number;
  lastUsedMs: number;
  /** Called (synchronously) when a load finishes. */
  waiting: ((value: T | null) => void)[];
}

/** One GPU upload and how many hold it. */
export interface ImageManagerGpuRecord {
  upload: ImageManagerGpuUpload;
  users: number;
  bytes: number;
  lastUsedMs: number;
}

/** Everything known about one image. */
export interface ImageManagerEntry {
  key: string;
  source: ImageManagerSource | null;
  width: number;
  height: number;
  thumbnail: ImageManagerSlot<ImageManagerThumbnail>;
  full: ImageManagerSlot<ImageManagerFullImage>;
  gpu: Map<object, ImageManagerGpuRecord>;
}

/**
 * What a live handle holds; kept by the manager so a dropped handle can still
 * be released.
 */
export interface ImageManagerHandleRecord {
  entry: ImageManagerEntry;
  level: ImageManagerLevel;
  /** GPU upload token (gpu level only). */
  token: object | null;
}

/**
 * Creates an empty entry.
 *
 * @param key Key (object URL).
 * @param source Source.
 * @returns Entry.
 */
export function imageManagerEntryCreate(key: string, source: ImageManagerSource): ImageManagerEntry {
  const slot = <T>(): ImageManagerSlot<T> => ({
    users: 0,
    state: 'empty',
    value: null,
    bytes: 0,
    lastUsedMs: 0,
    waiting: [],
  });
  return { key, source, width: 0, height: 0, thumbnail: slot(), full: slot(), gpu: new Map() };
}

/**
 * Describes one entry for the Debug Menu.
 *
 * @param entry Entry.
 * @param contexts WebGL contexts each upload lives in.
 * @returns Row.
 */
export function imageManagerEntryInfo(entry: ImageManagerEntry, contexts: number): ImageManagerEntryInfo {
  const uploads = [...entry.gpu.values()];
  const levels: ImageManagerEntryInfo['levels'] = {
    thumbnail: { users: entry.thumbnail.users, state: entry.thumbnail.state, bytes: entry.thumbnail.bytes },
    full: { users: entry.full.users, state: entry.full.state, bytes: entry.full.bytes },
    gpu: {
      users: uploads.reduce((sum, record) => sum + record.users, 0),
      state: uploads.length > 0 ? 'ready' : 'empty',
      bytes: uploads.reduce((sum, record) => sum + record.bytes, 0) * contexts,
    },
  };
  const holds = Object.values(levels).some((level) => level.bytes > 0);
  return {
    key: entry.key,
    hash: entry.source?.hash?.(),
    name: entry.source?.name ?? '(file gone)',
    origin: entry.source?.origin ?? '',
    sourced: entry.source !== null,
    width: entry.width,
    height: entry.height,
    levels,
    pooled: holds && Object.values(levels).every((level) => level.users === 0),
    lastUsedMs: Math.max(
      entry.thumbnail.lastUsedMs,
      entry.full.lastUsedMs,
      ...uploads.map((record) => record.lastUsedMs),
    ),
  };
}

/**
 * Loads a full image into an image element (as the texture cache always did).
 *
 * @param source Source.
 * @param done Called with the image, or null when it does not load.
 */
export function imageManagerFullLoadElement(
  source: ImageManagerSource,
  done: (image: ImageManagerFullImage | null) => void,
): void {
  if (typeof Image === 'undefined') return done(null);
  const image = new Image();
  image.onload = () => done(image);
  image.onerror = () => done(null);
  image.src = source.url;
}

/**
 * Lets go of a full image's pixels.
 *
 * @param image Image.
 */
export function imageManagerFullFree(image: ImageManagerFullImage): void {
  if ('close' in image) image.close();
  else if (typeof image.removeAttribute === 'function') image.removeAttribute('src');
}
