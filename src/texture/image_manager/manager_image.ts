import {
  IMAGE_MANAGER_RAM_BUDGET_BYTES,
  IMAGE_MANAGER_VRAM_BUDGET_BYTES,
  imageManagerRgbaBytes,
  type ImageManagerEntryInfo,
  type ImageManagerFullImage,
  type ImageManagerGpuUpload,
  type ImageManagerLedger,
  type ImageManagerLevel,
  type ImageManagerLevelState,
  type ImageManagerSource,
  type ImageManagerThumbnail,
} from './image_manager_types.js';
import {
  ImageManagerThumbnailMaker,
  imageManagerFullHeight,
  imageManagerFullWidth,
  type ImageManagerThumbnailMake,
} from './image_manager_thumbnail_maker.js';
import {
  imageManagerEntryCreate,
  imageManagerEntryInfo,
  imageManagerFullFree,
  imageManagerFullLoadElement,
  type ImageManagerEntry,
  type ImageManagerEvictCandidate,
  type ImageManagerGpuRecord,
  type ImageManagerHandleRecord,
  type ImageManagerSlot,
} from './image_manager_entry.js';
import { ImageManagerHandle } from './image_manager_handle.js';

export { ImageManagerHandle } from './image_manager_handle.js';

/**
 * GPU uploads nobody uses are freed after this long, or sooner when over the
 * VRAM budget.
 */
export const IMAGE_MANAGER_GPU_UNUSED_MS = 30_000;

/**
 * Loads a full image; calls done once (synchronously from the load event, so
 * callers swap at once).
 */
export type ImageManagerFullLoad = (
  source: ImageManagerSource,
  done: (image: ImageManagerFullImage | null) => void,
) => void;

/**
 * Settings of an image manager (tests replace the loaders, the clock and the
 * budgets).
 */
export interface ImageManagerOptions {
  fullLoad?: ImageManagerFullLoad;
  thumbnailMake?: ImageManagerThumbnailMake;
  now?: () => number;
  ramBudgetBytes?: number;
  vramBudgetBytes?: number;
  /**
   * Number of WebGL contexts each GPU upload lives in (main window plus
   * detached windows).
   */
  contexts?: () => number;
  /** Warns about handles dropped without release() (development builds). */
  warnLeaks?: boolean;
  /** Schedules the sweep of unused GPU uploads (setTimeout by default). */
  schedule?: (callback: () => void, ms: number) => unknown;
}

/**
 * Owns the lifetime of images and their derived forms: every image (keyed by
 * its object URL) has three levels: a small compressed thumbnail, the decoded
 * full image and its GPU uploads, each with its own users. A level nobody uses
 * is not dropped at once but waits in an unused pool, dropped oldest first
 * while the RAM or VRAM ledger is over budget (GPU uploads also after
 * {@link IMAGE_MANAGER_GPU_UNUSED_MS}). Budgets are this manager's own
 * estimates: the browser cannot be asked for the real numbers.
 */
export class ManagerImage {
  private readonly entries = new Map<string, ImageManagerEntry>();
  /**
   * Thumbnails by content hash: files with the same content share them, and
   * they outlive their file.
   */
  private readonly thumbnailsByHash = new Map<string, { thumbnail: ImageManagerThumbnail; lastUsedMs: number }>();
  private readonly live = new Set<ImageManagerHandleRecord>();
  private readonly registry: FinalizationRegistry<ImageManagerHandleRecord> | null;
  private readonly fullLoad: ImageManagerFullLoad;
  private readonly thumbnailMake: ImageManagerThumbnailMake;
  private readonly now: () => number;
  private readonly contexts: () => number;
  private readonly schedule: (callback: () => void, ms: number) => unknown;
  private readonly warnLeaks: boolean;
  private sweepPending = false;
  private evictions = 0;
  readonly ramBudgetBytes: number;
  readonly vramBudgetBytes: number;

  /**
   * Creates a manager.
   *
   * @param options Loaders, clock and budgets.
   */
  constructor(options: ImageManagerOptions = {}) {
    this.fullLoad = options.fullLoad ?? imageManagerFullLoadElement;
    this.thumbnailMake = options.thumbnailMake ?? new ImageManagerThumbnailMaker().make;
    this.now = options.now ?? (() => Date.now());
    this.contexts = options.contexts ?? (() => 1);
    this.schedule = options.schedule ?? ((callback, ms) => setTimeout(callback, ms));
    this.ramBudgetBytes = options.ramBudgetBytes ?? IMAGE_MANAGER_RAM_BUDGET_BYTES;
    this.vramBudgetBytes = options.vramBudgetBytes ?? IMAGE_MANAGER_VRAM_BUDGET_BYTES;
    this.warnLeaks = options.warnLeaks ?? false;
    this.registry =
      typeof FinalizationRegistry === 'undefined'
        ? null
        : new FinalizationRegistry((record) => this.handleDropped(record));
  }

  /**
   * Registers an image (or updates where it is read from), keyed by its object
   * URL. Levels already loaded stay.
   *
   * @param source Image source.
   * @returns Key of the image.
   */
  sourceSet(source: ImageManagerSource): string {
    const existing = this.entries.get(source.url);
    if (existing !== undefined) {
      existing.source = source;
      return existing.key;
    }
    this.entries.set(source.url, imageManagerEntryCreate(source.url, source));
    return source.url;
  }

  /**
   * Moves an image to a new object URL (same content, read from a new place),
   * keeping its levels and handles.
   *
   * @param oldUrl Previous URL.
   * @param source Image at its new URL.
   */
  sourceRepoint(oldUrl: string, source: ImageManagerSource): void {
    const entry = this.entries.get(oldUrl);
    if (entry === undefined) return void this.sourceSet(source);
    const placeholder = this.entries.get(source.url);
    if (placeholder !== undefined && placeholder !== entry) this.entries.delete(source.url);
    this.entries.delete(oldUrl);
    entry.key = source.url;
    entry.source = source;
    this.entries.set(source.url, entry);
  }

  /**
   * Tells the manager the image's file is gone (its URL is about to be
   * revoked). Levels in use stay until released; the entry then ends.
   *
   * @param url Object URL.
   */
  sourceRemove(url: string): void {
    const entry = this.entries.get(url);
    if (entry === undefined) return;
    entry.source = null;
    this.entryEndIfUnused(entry);
  }

  /**
   * Returns whether an image is registered.
   *
   * @param url Object URL.
   * @returns True when known.
   */
  has(url: string): boolean {
    return this.entries.has(url);
  }

  /**
   * Claims an image's thumbnail, made off the main thread on first use (from
   * the full image when it is loaded anyway, held only while the thumbnail is
   * made).
   *
   * @param url Object URL of a registered image.
   * @returns Handle, or null for an unknown image.
   */
  acquireThumbnail(url: string): ImageManagerHandle<ImageManagerThumbnail> | null {
    const entry = this.entries.get(url);
    if (entry === undefined) return null;
    const slot = entry.thumbnail;
    this.slotClaim(slot);
    if (slot.state === 'empty' || slot.state === 'failed') this.thumbnailStart(entry);
    return this.handleCreate(entry, 'thumbnail', null, () => (slot.state === 'ready' ? slot.value : null));
  }

  /**
   * Claims an image's decoded full image.
   *
   * @param url Object URL of a registered image.
   * @returns Handle, or null for an unknown image.
   */
  acquireFull(url: string): ImageManagerHandle<ImageManagerFullImage> | null {
    const entry = this.entries.get(url);
    if (entry === undefined) return null;
    const slot = entry.full;
    this.slotClaim(slot);
    if (slot.state === 'empty' || slot.state === 'failed') this.fullStart(entry);
    return this.handleCreate(entry, 'full', null, () => (slot.state === 'ready' ? slot.value : null));
  }

  /**
   * Claims a GPU upload of an image (a THREE.Texture showing it). When nobody
   * holds an upload any more it waits in the unused pool and is then freed with
   * its dispose callback (it uploads again if still drawn).
   *
   * @param url Object URL of a registered image.
   * @param token The uploaded object (the THREE.Texture).
   * @param upload How to free it and whether it has mipmaps.
   * @returns Handle, or null for an unknown image.
   */
  acquireGpu(url: string, token: object, upload: ImageManagerGpuUpload): ImageManagerHandle<object> | null {
    const entry = this.entries.get(url);
    if (entry === undefined) return null;
    let record = entry.gpu.get(token);
    if (record === undefined) {
      record = { upload, users: 0, bytes: 0, lastUsedMs: this.now() };
      entry.gpu.set(token, record);
    }
    record.upload = upload;
    record.users += 1;
    record.lastUsedMs = this.now();
    this.gpuMeasure(entry);
    const handle = this.handleCreate<object>(entry, 'gpu', token, () => token);
    this.budgetsEnforce();
    return handle;
  }

  /**
   * Returns the rows of the Debug Menu's handle list.
   *
   * @returns One row per image, most recently used first.
   */
  entriesInfo(): ImageManagerEntryInfo[] {
    const contexts = Math.max(1, this.contexts());
    return [...this.entries.values()]
      .map((entry) => imageManagerEntryInfo(entry, contexts))
      .sort((a, b) => b.lastUsedMs - a.lastUsedMs);
  }

  /**
   * Returns the byte ledger (estimates).
   *
   * @returns Ledger.
   */
  ledger(): ImageManagerLedger {
    let thumbnailBytes = 0;
    let fullBytes = 0;
    let gpuBytesPerContext = 0;
    let pooledRamBytes = 0;
    let pooledGpuBytes = 0;
    this.entries.forEach((entry) => {
      thumbnailBytes += entry.thumbnail.bytes;
      fullBytes += entry.full.bytes;
      if (entry.thumbnail.users === 0) pooledRamBytes += entry.thumbnail.bytes;
      if (entry.full.users === 0) pooledRamBytes += entry.full.bytes;
      entry.gpu.forEach((record) => {
        gpuBytesPerContext += record.bytes;
        if (record.users === 0) pooledGpuBytes += record.bytes;
      });
    });
    const thumbnailCacheBytes = this.thumbnailCacheBytes();
    const contexts = Math.max(1, this.contexts());
    return {
      entries: this.entries.size,
      thumbnailBytes,
      thumbnailCacheBytes,
      fullBytes,
      gpuBytesPerContext,
      contexts,
      gpuBytes: gpuBytesPerContext * contexts,
      pooledRamBytes: pooledRamBytes + thumbnailCacheBytes,
      pooledGpuBytes: pooledGpuBytes * contexts,
      ramBudgetBytes: this.ramBudgetBytes,
      vramBudgetBytes: this.vramBudgetBytes,
      evictions: this.evictions,
    };
  }

  /**
   * Returns the number of handles not yet released.
   *
   * @returns Count.
   */
  liveHandles(): number {
    return this.live.size;
  }

  /**
   * Notes that an upload's image changed size (re-measures its bytes).
   *
   * @param url Object URL.
   */
  gpuRemeasure(url: string): void {
    const entry = this.entries.get(url);
    if (entry !== undefined) this.gpuMeasure(entry);
  }

  /** Drops every unused level now (as if all budgets were zero). */
  trim(): void {
    this.budgetsEnforce(0, 0);
  }

  /** @internal Waits for a handle's level to load. */
  readyWait(record: ImageManagerHandleRecord, callback: (value: unknown) => void): void {
    if (record.level === 'gpu') return callback(record.token);
    const slot = record.level === 'thumbnail' ? record.entry.thumbnail : record.entry.full;
    if (slot.state === 'ready' || slot.state === 'failed') return callback(slot.value);
    (slot.waiting as ((value: unknown) => void)[]).push(callback);
  }

  /** @internal Gives back a handle's claim. */
  handleRelease(handle: object, record: ImageManagerHandleRecord): void {
    this.registry?.unregister(handle);
    this.claimDrop(record);
  }

  /**
   * Creates a handle and tracks it.
   *
   * @param entry Entry.
   * @param level Level.
   * @param token GPU token.
   * @param read Reads the level's value.
   * @returns Handle.
   */
  private handleCreate<T>(
    entry: ImageManagerEntry,
    level: ImageManagerLevel,
    token: object | null,
    read: () => T | null,
  ): ImageManagerHandle<T> {
    const record: ImageManagerHandleRecord = { entry, level, token };
    this.live.add(record);
    const ready = new Promise<T | null>((resolve) => this.readyWait(record, (value) => resolve(value as T | null)));
    const handle = new ImageManagerHandle<T>(this, record, ready, read);
    this.registry?.register(handle, record, handle);
    return handle;
  }

  /**
   * A handle was garbage collected without release(): warn (development) and
   * give its claim back so the image can still be freed.
   *
   * @param record The handle's claim.
   */
  private handleDropped(record: ImageManagerHandleRecord): void {
    if (!this.live.has(record)) return;
    if (this.warnLeaks)
      console.warn(
        `ManagerImage: a ${record.level} handle of "${record.entry.source?.name ?? record.entry.key}" was dropped without release()`,
      );
    this.claimDrop(record);
  }

  /**
   * Removes one user from a level; unused levels go to the pool.
   *
   * @param record Claim.
   */
  private claimDrop(record: ImageManagerHandleRecord): void {
    if (!this.live.delete(record)) return;
    const { entry } = record;
    if (record.level === 'gpu') {
      const gpu = record.token === null ? undefined : entry.gpu.get(record.token);
      if (gpu !== undefined) {
        gpu.users = Math.max(0, gpu.users - 1);
        gpu.lastUsedMs = this.now();
        if (gpu.users === 0) this.sweepSchedule();
      }
    } else {
      const slot = record.level === 'thumbnail' ? entry.thumbnail : entry.full;
      slot.users = Math.max(0, slot.users - 1);
      slot.lastUsedMs = this.now();
    }
    this.budgetsEnforce();
    this.entryEndIfUnused(entry);
  }

  /**
   * Adds a user to a level.
   *
   * @param slot Level.
   */
  private slotClaim(slot: { users: number; lastUsedMs: number }): void {
    slot.users += 1;
    slot.lastUsedMs = this.now();
  }

  /**
   * Starts loading the full image.
   *
   * @param entry Entry.
   */
  private fullStart(entry: ImageManagerEntry): void {
    const source = entry.source;
    const slot = entry.full;
    if (source === null) return this.slotSettle(slot, null, 'failed');
    slot.state = 'loading';
    this.fullLoad(source, (image) => {
      if (slot.state !== 'loading') {
        if (image !== null) imageManagerFullFree(image);
        return;
      }
      if (image !== null) {
        entry.width = imageManagerFullWidth(image);
        entry.height = imageManagerFullHeight(image);
        slot.bytes = imageManagerRgbaBytes(entry.width, entry.height);
      }
      this.slotSettle(slot, image, image === null ? 'failed' : 'ready');
      this.gpuMeasure(entry);
      this.budgetsEnforce();
      this.entryEndIfUnused(entry);
    });
  }

  /**
   * Starts making the thumbnail: reused by content hash when known, else made
   * from the full image (held meanwhile) when it is loaded, else from the
   * file.
   *
   * @param entry Entry.
   */
  private thumbnailStart(entry: ImageManagerEntry): void {
    const source = entry.source;
    const slot = entry.thumbnail;
    if (source === null) return this.slotSettle(slot, null, 'failed');
    const hash = source.hash?.();
    const cached = hash === undefined ? undefined : this.thumbnailsByHash.get(hash);
    if (cached !== undefined) {
      cached.lastUsedMs = this.now();
      return this.thumbnailSettle(entry, cached.thumbnail);
    }
    slot.state = 'loading';
    const full = entry.full.state === 'ready' ? this.acquireFull(entry.key) : null;
    void this.thumbnailMake(source.blob, full?.value ?? null)
      .catch(() => null)
      .then((thumbnail) => {
        full?.release();
        if (slot.state !== 'loading') return;
        const known = source.hash?.();
        if (thumbnail !== null && known !== undefined)
          this.thumbnailsByHash.set(known, { thumbnail, lastUsedMs: this.now() });
        this.thumbnailSettle(entry, thumbnail);
      });
  }

  /**
   * Finishes a thumbnail.
   *
   * @param entry Entry.
   * @param thumbnail Thumbnail, or null.
   */
  private thumbnailSettle(entry: ImageManagerEntry, thumbnail: ImageManagerThumbnail | null): void {
    const slot = entry.thumbnail;
    if (thumbnail !== null) {
      slot.bytes = thumbnail.blob.size;
      if (entry.width === 0) {
        entry.width = thumbnail.sourceWidth;
        entry.height = thumbnail.sourceHeight;
      }
    }
    this.slotSettle(slot, thumbnail, thumbnail === null ? 'failed' : 'ready');
    this.budgetsEnforce();
    this.entryEndIfUnused(entry);
  }

  /**
   * Sets a level's value and wakes its waiters.
   *
   * @param slot Level.
   * @param value Value, or null.
   * @param state New state.
   */
  private slotSettle<T>(slot: ImageManagerSlot<T>, value: T | null, state: ImageManagerLevelState): void {
    slot.value = value;
    slot.state = state;
    if (value === null) slot.bytes = 0;
    const waiting = slot.waiting;
    slot.waiting = [];
    waiting.forEach((callback) => callback(value));
  }

  /**
   * Re-measures an entry's GPU uploads from its size.
   *
   * @param entry Entry.
   */
  private gpuMeasure(entry: ImageManagerEntry): void {
    entry.gpu.forEach((record) => {
      record.bytes = imageManagerRgbaBytes(entry.width, entry.height, record.upload.mipmaps);
    });
  }

  /**
   * Bytes of thumbnails kept only by hash (their entry is gone or holds none).
   *
   * @returns Bytes.
   */
  private thumbnailCacheBytes(): number {
    const held = new Set<Blob>();
    this.entries.forEach((entry) => {
      if (entry.thumbnail.value !== null) held.add(entry.thumbnail.value.blob);
    });
    let bytes = 0;
    this.thumbnailsByHash.forEach(({ thumbnail }) => {
      if (!held.has(thumbnail.blob)) bytes += thumbnail.blob.size;
    });
    return bytes;
  }

  /** Frees unused GPU uploads after a while (one timer, never per frame). */
  private sweepSchedule(): void {
    if (this.sweepPending) return;
    this.sweepPending = true;
    this.schedule(() => {
      this.sweepPending = false;
      this.gpuSweep();
    }, IMAGE_MANAGER_GPU_UNUSED_MS);
  }

  /** Frees GPU uploads unused for {@link IMAGE_MANAGER_GPU_UNUSED_MS}. */
  gpuSweep(): void {
    const cutoff = this.now() - IMAGE_MANAGER_GPU_UNUSED_MS;
    let pending = false;
    this.entries.forEach((entry) =>
      entry.gpu.forEach((record, token) => {
        if (record.users > 0) return;
        if (record.lastUsedMs <= cutoff) this.gpuFree(entry, token, record);
        else pending = true;
      }),
    );
    this.entries.forEach((entry) => this.entryEndIfUnused(entry));
    if (pending) this.sweepSchedule();
  }

  /**
   * Frees one unused GPU upload.
   *
   * @param entry Entry.
   * @param token Upload token.
   * @param record Upload.
   */
  private gpuFree(entry: ImageManagerEntry, token: object, record: ImageManagerGpuRecord): void {
    entry.gpu.delete(token);
    this.evictions += 1;
    record.upload.dispose();
  }

  /**
   * Drops unused levels, oldest first, while a ledger is over its budget.
   *
   * @param ramBudget RAM budget.
   * @param vramBudget VRAM budget.
   */
  private budgetsEnforce(ramBudget = this.ramBudgetBytes, vramBudget = this.vramBudgetBytes): void {
    const ledger = this.ledger();
    const ram = ledger.thumbnailBytes + ledger.thumbnailCacheBytes + ledger.fullBytes;
    if (ram > ramBudget) this.ramEvict(ram, ramBudget);
    if (ledger.gpuBytes > vramBudget) this.vramEvict(ledger.gpuBytes, vramBudget, ledger.contexts);
    this.entries.forEach((entry) => this.entryEndIfUnused(entry));
  }

  /**
   * Drops unused thumbnails and full images, oldest first, until RAM fits.
   *
   * @param ram Current RAM ledger.
   * @param ramBudget Budget.
   */
  private ramEvict(ram: number, ramBudget: number): void {
    const candidates = this.ramCandidates().sort((a, b) => a.lastUsedMs - b.lastUsedMs);
    for (const candidate of candidates) {
      if (ram <= ramBudget) break;
      candidate.drop();
      this.evictions += 1;
      ram -= candidate.bytes;
    }
  }

  /**
   * Lists what may be dropped to save RAM: unused thumbnails, thumbnails kept
   * only by hash, and unused full images no GPU upload may read again.
   *
   * @returns Candidates with their bytes and last use.
   */
  private ramCandidates(): ImageManagerEvictCandidate[] {
    const candidates: ImageManagerEvictCandidate[] = [];
    const held = new Set<Blob>();
    this.entries.forEach((entry) => {
      const { full, thumbnail } = entry;
      if (thumbnail.value !== null) held.add(thumbnail.value.blob);
      if (full.users === 0 && full.state === 'ready' && entry.gpu.size === 0)
        candidates.push({ lastUsedMs: full.lastUsedMs, bytes: full.bytes, drop: () => this.fullDrop(entry) });
      if (thumbnail.users === 0 && thumbnail.state === 'ready')
        candidates.push({
          lastUsedMs: thumbnail.lastUsedMs,
          bytes: thumbnail.bytes,
          drop: () => this.thumbnailDrop(entry),
        });
    });
    this.thumbnailsByHash.forEach((cached, hash) => {
      if (held.has(cached.thumbnail.blob)) return;
      candidates.push({
        lastUsedMs: cached.lastUsedMs,
        bytes: cached.thumbnail.blob.size,
        drop: () => this.thumbnailsByHash.delete(hash),
      });
    });
    return candidates;
  }

  /**
   * Frees unused GPU uploads, oldest first, until VRAM fits.
   *
   * @param vram Current VRAM ledger (all contexts).
   * @param vramBudget Budget.
   * @param contexts WebGL contexts each upload lives in.
   */
  private vramEvict(vram: number, vramBudget: number, contexts: number): void {
    const candidates: { entry: ImageManagerEntry; token: object; record: ImageManagerGpuRecord }[] = [];
    this.entries.forEach((entry) =>
      entry.gpu.forEach((record, token) => {
        if (record.users === 0) candidates.push({ entry, token, record });
      }),
    );
    candidates.sort((a, b) => a.record.lastUsedMs - b.record.lastUsedMs);
    for (const { entry, token, record } of candidates) {
      if (vram <= vramBudget) break;
      vram -= record.bytes * contexts;
      this.gpuFree(entry, token, record);
    }
  }

  /**
   * Drops a full image.
   *
   * @param entry Entry.
   */
  private fullDrop(entry: ImageManagerEntry): void {
    const image = entry.full.value;
    entry.full.value = null;
    entry.full.bytes = 0;
    entry.full.state = 'empty';
    if (image !== null) imageManagerFullFree(image);
  }

  /**
   * Drops a thumbnail (a copy by hash may stay).
   *
   * @param entry Entry.
   */
  private thumbnailDrop(entry: ImageManagerEntry): void {
    const blob = entry.thumbnail.value?.blob;
    entry.thumbnail.value = null;
    entry.thumbnail.bytes = 0;
    entry.thumbnail.state = 'empty';
    this.thumbnailsByHash.forEach((cached, hash) => {
      if (cached.thumbnail.blob === blob) this.thumbnailsByHash.delete(hash);
    });
  }

  /**
   * Ends an entry whose file is gone once nothing uses or loads it.
   *
   * @param entry Entry.
   */
  private entryEndIfUnused(entry: ImageManagerEntry): void {
    if (entry.source !== null || this.entries.get(entry.key) !== entry) return;
    if (entry.thumbnail.users > 0 || entry.full.users > 0) return;
    if ([...entry.gpu.values()].some((record) => record.users > 0)) return;
    entry.gpu.forEach((record, token) => this.gpuFree(entry, token, record));
    if (entry.full.state === 'loading') entry.full.state = 'empty';
    if (entry.thumbnail.state === 'loading') entry.thumbnail.state = 'empty';
    this.fullDrop(entry);
    entry.thumbnail.value = null;
    entry.thumbnail.bytes = 0;
    this.entries.delete(entry.key);
  }
}
