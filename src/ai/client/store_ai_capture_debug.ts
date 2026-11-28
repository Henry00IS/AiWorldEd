/** One AI capture image entry kept for local visual debugging. */
export interface AiCaptureDebugEntry {
  /** Stable unique id for this capture. */
  id: string;
  /** Wall-clock time when the capture was stored. */
  createdAtMs: number;
  /** Image mime type (image/jpeg). */
  mimeType: string;
  /** Raw base64 without data-URL prefix. */
  base64: string;
  /** Output width in pixels. */
  width: number;
  /** Output height in pixels. */
  height: number;
  /** Capture shading mode label. */
  shading: string;
  /** Short camera summary for the list row. */
  cameraSummary: string;
  /** Number of brushes used for framing metadata. */
  framedBrushCount: number;
  /** Success message text stored with the capture. */
  message: string;
}

/** Input fields required to record one capture debug entry. */
export interface AiCaptureDebugRecordInput {
  mimeType: string;
  base64: string;
  width: number;
  height: number;
  shading: string;
  cameraSummary: string;
  framedBrushCount: number;
  message: string;
}

/** Maximum captures retained in the debug list (the oldest go first). */
export const AI_CAPTURE_DEBUG_MAX_ENTRIES = 20;

/**
 * Most image bytes retained in the debug list (decoded from base64); the oldest
 * captures go first, but the newest one is always kept.
 */
export const AI_CAPTURE_DEBUG_MAX_BYTES = 8 * 1024 * 1024;

/**
 * Returns the bytes of a capture's image (its base64 text decodes to 3 bytes
 * per 4 characters).
 *
 * @param entry Capture.
 * @returns Image bytes.
 */
export function aiCaptureDebugEntryBytes(entry: Pick<AiCaptureDebugEntry, 'base64'>): number {
  const padding = entry.base64.endsWith('==') ? 2 : entry.base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((entry.base64.length * 3) / 4) - padding);
}

/**
 * In-memory history of AI capture debug images, as base64 text (no object URLs
 * or decoded bitmaps: the Debug Menu decodes them only while it shows them).
 */
export class StoreAiCaptureDebug {
  private readonly entries: AiCaptureDebugEntry[];
  private readonly listeners: Set<() => void>;
  private nextId: number;

  /** Creates an empty capture debug store. */
  constructor() {
    this.entries = [];
    this.listeners = new Set();
    this.nextId = 1;
  }

  /**
   * Records one capture at the front of the list (newest first).
   *
   * @param input Capture image and metadata.
   * @returns The stored entry.
   */
  record(input: AiCaptureDebugRecordInput): AiCaptureDebugEntry {
    const entry = this.createEntry(input);
    this.entries.unshift(entry);
    this.trimToMaxEntries();
    this.notifyListeners();
    return entry;
  }

  /** Removes every stored capture. */
  clear(): void {
    if (this.entries.length === 0) {
      return;
    }
    this.entries.length = 0;
    this.notifyListeners();
  }

  /**
   * Returns stored captures newest-first.
   *
   * @returns Readonly entry list.
   */
  list(): readonly AiCaptureDebugEntry[] {
    return this.entries;
  }

  /**
   * Returns the image bytes of every stored capture.
   *
   * @returns Byte count.
   */
  bytes(): number {
    return this.entries.reduce((sum, entry) => sum + aiCaptureDebugEntryBytes(entry), 0);
  }

  /**
   * Returns how many captures are stored.
   *
   * @returns Entry count.
   */
  count(): number {
    return this.entries.length;
  }

  /**
   * Subscribes to store changes. Returns an unsubscribe function.
   *
   * @param listener Callback invoked when the store changes.
   * @returns Unsubscribe function.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Builds one debug entry from capture input.
   *
   * @param input Capture payload.
   * @returns New entry with id and timestamp.
   */
  private createEntry(input: AiCaptureDebugRecordInput): AiCaptureDebugEntry {
    const id = `capture_${this.nextId}`;
    this.nextId += 1;
    return {
      id,
      createdAtMs: Date.now(),
      mimeType: input.mimeType,
      base64: input.base64,
      width: input.width,
      height: input.height,
      shading: input.shading,
      cameraSummary: input.cameraSummary,
      framedBrushCount: input.framedBrushCount,
      message: input.message,
    };
  }

  /**
   * Drops the oldest entries while over the count or byte limit (keeps the
   * newest).
   */
  private trimToMaxEntries(): void {
    if (this.entries.length > AI_CAPTURE_DEBUG_MAX_ENTRIES) this.entries.length = AI_CAPTURE_DEBUG_MAX_ENTRIES;
    let bytes = this.bytes();
    while (this.entries.length > 1 && bytes > AI_CAPTURE_DEBUG_MAX_BYTES) {
      bytes -= aiCaptureDebugEntryBytes(this.entries.pop()!);
    }
  }

  /** Notifies all subscribers of a store change. */
  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

/** Shared process-wide store of AI capture debug entries. */
export const sharedAiCaptureDebugStore = new StoreAiCaptureDebug();
