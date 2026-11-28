import { describe, expect, it, vi } from 'vitest';
import { ManagerImage, IMAGE_MANAGER_GPU_UNUSED_MS } from '@/texture/image_manager/manager_image.js';
import type {
  ImageManagerFullImage,
  ImageManagerSource,
  ImageManagerThumbnail,
} from '@/texture/image_manager/image_manager_types.js';
import { imageManagerRgbaBytes, imageManagerThumbnailSize } from '@/texture/image_manager/image_manager_types.js';

/** Full image stand-in of a given size. */
function bitmapFake(width: number, height: number): ImageManagerFullImage & { closed: boolean } {
  const fake = { width, height, closed: false, close: () => (fake.closed = true) };
  return fake as unknown as ImageManagerFullImage & { closed: boolean };
}

/** A manager whose loads finish when the test says so. */
function fixture(options: { ramBudgetBytes?: number; vramBudgetBytes?: number; contexts?: number } = {}) {
  let clock = 1000;
  const fullPending = new Map<string, (image: ImageManagerFullImage | null) => void>();
  const thumbnailCalls: { blob: Blob; full: ImageManagerFullImage | null }[] = [];
  const thumbnailPending: ((thumbnail: ImageManagerThumbnail | null) => void)[] = [];
  const scheduled: (() => void)[] = [];
  const manager = new ManagerImage({
    now: () => clock,
    ...(options.ramBudgetBytes === undefined ? {} : { ramBudgetBytes: options.ramBudgetBytes }),
    ...(options.vramBudgetBytes === undefined ? {} : { vramBudgetBytes: options.vramBudgetBytes }),
    contexts: () => options.contexts ?? 1,
    schedule: (callback) => scheduled.push(callback),
    fullLoad: (source, done) => fullPending.set(source.url, done),
    thumbnailMake: (blob, full) => {
      thumbnailCalls.push({ blob, full });
      return new Promise((resolve) => thumbnailPending.push(resolve));
    },
  });
  const source = (url: string, hash?: string): ImageManagerSource => ({
    name: `${url}.png`,
    origin: 'test',
    blob: new Blob([url]),
    url,
    hash: () => hash,
  });
  const thumbnail = (bytes: number): ImageManagerThumbnail => ({
    blob: new Blob([new Uint8Array(bytes)], { type: 'image/webp' }),
    width: 256,
    height: 256,
    sourceWidth: 1024,
    sourceHeight: 1024,
  });
  return {
    manager,
    source,
    thumbnail,
    fullPending,
    thumbnailCalls,
    thumbnailPending,
    scheduled,
    tick: (ms: number) => (clock += ms),
    flush: () => new Promise((resolve) => setTimeout(resolve, 0)),
  };
}

describe('ManagerImage', () => {
  it('counts users per level and loads a level once', () => {
    const f = fixture();
    f.manager.sourceSet(f.source('a'));
    const one = f.manager.acquireFull('a')!;
    const two = f.manager.acquireFull('a')!;
    expect(f.fullPending.size).toBe(1);
    const image = bitmapFake(64, 32);
    f.fullPending.get('a')!(image);
    expect(one.value).toBe(image);
    expect(two.value).toBe(image);
    const row = f.manager.entriesInfo()[0]!;
    expect(row.levels.full).toEqual({ users: 2, state: 'ready', bytes: 64 * 32 * 4 });
    expect(row.levels.thumbnail.users).toBe(0);
    expect([row.width, row.height]).toEqual([64, 32]);
    one.release();
    expect(f.manager.entriesInfo()[0]!.levels.full.users).toBe(1);
    expect(f.manager.liveHandles()).toBe(1);
  });

  it('release is idempotent and a released handle reads nothing', () => {
    const f = fixture();
    f.manager.sourceSet(f.source('a'));
    const one = f.manager.acquireFull('a')!;
    const two = f.manager.acquireFull('a')!;
    f.fullPending.get('a')!(bitmapFake(8, 8));
    one.release();
    one.release();
    one.release();
    expect(one.released).toBe(true);
    expect(one.value).toBeNull();
    expect(f.manager.entriesInfo()[0]!.levels.full.users).toBe(1);
    expect(two.value).not.toBeNull();
  });

  it('calls onReady synchronously from the load and resolves ready', async () => {
    const f = fixture();
    f.manager.sourceSet(f.source('a'));
    const handle = f.manager.acquireFull('a')!;
    const seen: unknown[] = [];
    handle.onReady((value) => seen.push(value));
    const image = bitmapFake(4, 4);
    f.fullPending.get('a')!(image);
    expect(seen).toEqual([image]);
    await expect(handle.ready).resolves.toBe(image);
  });

  it('keeps unused levels in a pool and evicts the oldest first when over the RAM budget', () => {
    const bytes = imageManagerRgbaBytes(16, 16);
    const f = fixture({ ramBudgetBytes: bytes * 2 });
    const images: Record<string, ReturnType<typeof bitmapFake>> = {};
    for (const url of ['a', 'b', 'c']) {
      f.manager.sourceSet(f.source(url));
      const handle = f.manager.acquireFull(url)!;
      images[url] = bitmapFake(16, 16);
      f.fullPending.get(url)!(images[url]);
      f.tick(10);
      handle.release();
    }
    // Three unused images, budget for two: the oldest one went.
    expect(images['a']!.closed).toBe(true);
    expect(images['b']!.closed).toBe(false);
    expect(images['c']!.closed).toBe(false);
    const ledger = f.manager.ledger();
    expect(ledger.fullBytes).toBe(bytes * 2);
    expect(ledger.pooledRamBytes).toBe(bytes * 2);
    expect(ledger.evictions).toBe(1);
    // A pooled level comes back without loading again.
    f.fullPending.clear();
    const again = f.manager.acquireFull('c')!;
    expect(again.value).toBe(images['c']);
    expect(f.fullPending.size).toBe(0);
  });

  it('never evicts a level in use, even over budget', () => {
    const f = fixture({ ramBudgetBytes: 1 });
    f.manager.sourceSet(f.source('a'));
    const handle = f.manager.acquireFull('a')!;
    const image = bitmapFake(32, 32);
    f.fullPending.get('a')!(image);
    expect(image.closed).toBe(false);
    expect(f.manager.ledger().fullBytes).toBeGreaterThan(1);
    handle.release();
    expect(image.closed).toBe(true);
    expect(f.manager.ledger().fullBytes).toBe(0);
  });

  it('reloads a level that was evicted', () => {
    const f = fixture({ ramBudgetBytes: 0 });
    f.manager.sourceSet(f.source('a'));
    f.manager.acquireFull('a')!.release();
    f.fullPending.get('a')!(bitmapFake(4, 4));
    f.fullPending.clear();
    const handle = f.manager.acquireFull('a')!;
    expect(handle.value).toBeNull();
    expect(f.fullPending.has('a')).toBe(true);
  });

  it('makes a thumbnail from the file when the full image is not loaded', async () => {
    const f = fixture();
    const source = f.source('a');
    f.manager.sourceSet(source);
    const handle = f.manager.acquireThumbnail('a')!;
    expect(f.thumbnailCalls).toEqual([{ blob: source.blob, full: null }]);
    expect(f.fullPending.size).toBe(0);
    const thumbnail = f.thumbnail(100);
    f.thumbnailPending[0]!(thumbnail);
    await expect(handle.ready).resolves.toBe(thumbnail);
    const row = f.manager.entriesInfo()[0]!;
    expect(row.levels.thumbnail).toEqual({ users: 1, state: 'ready', bytes: 100 });
    expect([row.width, row.height]).toEqual([1024, 1024]);
  });

  it('holds the full image only while the thumbnail is made from it', async () => {
    const f = fixture();
    f.manager.sourceSet(f.source('a'));
    const full = f.manager.acquireFull('a')!;
    const image = bitmapFake(512, 512);
    f.fullPending.get('a')!(image);
    full.release();
    const thumbnailHandle = f.manager.acquireThumbnail('a')!;
    expect(f.thumbnailCalls[0]!.full).toBe(image);
    expect(f.manager.entriesInfo()[0]!.levels.full.users).toBe(1);
    f.thumbnailPending[0]!(f.thumbnail(10));
    await thumbnailHandle.ready;
    await f.flush();
    expect(f.manager.entriesInfo()[0]!.levels.full.users).toBe(0);
    expect(f.manager.liveHandles()).toBe(1);
  });

  it('shares thumbnails by content hash, also after the file is gone', async () => {
    const f = fixture();
    f.manager.sourceSet(f.source('a', 'hash1'));
    const handle = f.manager.acquireThumbnail('a')!;
    const thumbnail = f.thumbnail(50);
    f.thumbnailPending[0]!(thumbnail);
    await handle.ready;
    handle.release();
    f.manager.sourceRemove('a');
    expect(f.manager.has('a')).toBe(false);
    expect(f.manager.ledger().thumbnailCacheBytes).toBe(50);
    f.manager.sourceSet(f.source('b', 'hash1'));
    const reused = f.manager.acquireThumbnail('b')!;
    expect(reused.value).toBe(thumbnail);
    expect(f.thumbnailCalls).toHaveLength(1);
  });

  it('keeps an entry whose file is gone until its last user releases it', () => {
    const f = fixture();
    f.manager.sourceSet(f.source('a'));
    const handle = f.manager.acquireFull('a')!;
    const image = bitmapFake(4, 4);
    f.fullPending.get('a')!(image);
    f.manager.sourceRemove('a');
    expect(f.manager.has('a')).toBe(true);
    expect(f.manager.entriesInfo()[0]!.sourced).toBe(false);
    handle.release();
    expect(f.manager.has('a')).toBe(false);
    expect(image.closed).toBe(true);
  });

  it('frees unused GPU uploads after a while, never while used', () => {
    const f = fixture({ contexts: 2 });
    f.manager.sourceSet(f.source('a'));
    const full = f.manager.acquireFull('a')!;
    f.fullPending.get('a')!(bitmapFake(64, 64));
    const texture = {};
    const dispose = vi.fn();
    const first = f.manager.acquireGpu('a', texture, { mipmaps: true, dispose })!;
    const second = f.manager.acquireGpu('a', texture, { mipmaps: true, dispose })!;
    const ledger = f.manager.ledger();
    expect(ledger.gpuBytesPerContext).toBe(imageManagerRgbaBytes(64, 64, true));
    expect(ledger.gpuBytes).toBe(imageManagerRgbaBytes(64, 64, true) * 2);
    expect(f.manager.entriesInfo()[0]!.levels.gpu.users).toBe(2);
    first.release();
    expect(f.scheduled).toHaveLength(0);
    second.release();
    expect(f.scheduled).toHaveLength(1);
    expect(dispose).not.toHaveBeenCalled();
    f.tick(IMAGE_MANAGER_GPU_UNUSED_MS);
    f.scheduled.shift()!();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(f.manager.ledger().gpuBytes).toBe(0);
    full.release();
  });

  it('a GPU upload used again before the sweep stays', () => {
    const f = fixture();
    f.manager.sourceSet(f.source('a'));
    const texture = {};
    const dispose = vi.fn();
    f.manager.acquireGpu('a', texture, { mipmaps: false, dispose })!.release();
    f.tick(IMAGE_MANAGER_GPU_UNUSED_MS / 2);
    const again = f.manager.acquireGpu('a', texture, { mipmaps: false, dispose })!;
    f.tick(IMAGE_MANAGER_GPU_UNUSED_MS);
    f.scheduled.shift()!();
    expect(dispose).not.toHaveBeenCalled();
    again.release();
  });

  it('frees unused GPU uploads oldest first when over the VRAM budget', () => {
    const per = imageManagerRgbaBytes(32, 32);
    const f = fixture({ vramBudgetBytes: per * 2 });
    const disposed: string[] = [];
    for (const url of ['a', 'b', 'c']) {
      f.manager.sourceSet(f.source(url));
      const full = f.manager.acquireFull(url)!;
      f.fullPending.get(url)!(bitmapFake(32, 32));
      f.manager.acquireGpu(url, {}, { mipmaps: false, dispose: () => disposed.push(url) })!.release();
      f.tick(10);
      void full;
    }
    expect(disposed).toEqual(['a']);
  });

  it('moves an image to a new URL with its levels', () => {
    const f = fixture();
    f.manager.sourceSet(f.source('a'));
    const handle = f.manager.acquireFull('a')!;
    const image = bitmapFake(4, 4);
    f.fullPending.get('a')!(image);
    f.manager.sourceRepoint('a', f.source('b'));
    expect(f.manager.has('a')).toBe(false);
    expect(handle.key).toBe('b');
    expect(f.manager.acquireFull('b')!.value).toBe(image);
  });

  it('returns null handles for unknown images', () => {
    const f = fixture();
    expect(f.manager.acquireFull('nope')).toBeNull();
    expect(f.manager.acquireThumbnail('nope')).toBeNull();
    expect(f.manager.acquireGpu('nope', {}, { mipmaps: false, dispose: () => {} })).toBeNull();
  });

  it('sizes thumbnails by their short side, never enlarged', () => {
    expect(imageManagerThumbnailSize(1024, 512)).toEqual({ width: 512, height: 256 });
    expect(imageManagerThumbnailSize(100, 50)).toEqual({ width: 100, height: 50 });
    expect(imageManagerThumbnailSize(8192, 64)).toEqual({ width: 1024, height: 8 });
  });
});
