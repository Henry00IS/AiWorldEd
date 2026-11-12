import type { UserIdleWatch } from '@/utils/user_idle.js';

/** Default work per slice before the scan yields to the editor. */
export const PROJECT_TEXTURE_SCAN_SLICE_MS = 4;

/** Bytes read and searched per step of a file. */
const PROJECT_TEXTURE_SCAN_CHUNK_BYTES = 64 * 1024;

/** Length of a SHA-256 in hex. */
const PROJECT_TEXTURE_SCAN_HASH_LENGTH = 64;

/** Thrown when a scan was cancelled (project closed or switched). */
export class ProjectTextureScanCancelled extends Error {
  constructor() {
    super('the texture scan was cancelled');
    this.name = 'ProjectTextureScanCancelled';
  }
}

/** How a scan shares the main thread. */
export interface ProjectTextureScanOptions {
  /** Cancels the scan. */
  signal?: AbortSignal | undefined;
  /** Work per slice in milliseconds. */
  sliceMs?: number;
  /** Clock in milliseconds (tests). */
  clock?: () => number;
  /** Gives the event loop a turn (tests). */
  yieldNow?: () => Promise<void>;
  /**
   * Runs the scan only while the user is idle: at a slice boundary with recent
   * input the scan pauses, keeping its progress, until idle again.
   */
  idle?: UserIdleWatch | undefined;
}

/**
 * Splits a long scan into short slices: {@link pace} is called between small
 * steps and yields to the event loop (input, rendering, timers) once the
 * current slice used its budget, so no single task of the scan blocks the
 * editor for long. It also records the longest slice, and stops the scan with
 * {@link ProjectTextureScanCancelled} once the signal aborts.
 */
export class ProjectTextureScanPace {
  /** Longest slice so far, in milliseconds. */
  maxSliceMs = 0;
  /** Slices so far. */
  slices = 0;
  /** Times the scan paused for user input. */
  pauses = 0;
  private readonly sliceMs: number;
  private readonly clock: () => number;
  private readonly yieldNow: () => Promise<void>;
  private readonly signal: AbortSignal | undefined;
  private readonly idle: UserIdleWatch | undefined;
  private sliceStart: number;

  /**
   * Creates the pace of one scan.
   *
   * @param options Budget, cancel signal and test overrides.
   */
  constructor(options: ProjectTextureScanOptions = {}) {
    this.sliceMs = options.sliceMs ?? PROJECT_TEXTURE_SCAN_SLICE_MS;
    this.clock = options.clock ?? (() => performance.now());
    this.yieldNow = options.yieldNow ?? projectTextureScanYield;
    this.signal = options.signal;
    this.idle = options.idle;
    this.sliceStart = this.clock();
  }

  /**
   * Yields when the slice is used up; throws once cancelled.
   *
   * @returns Resolves when the scan may go on.
   */
  async pace(): Promise<void> {
    this.check();
    if (this.clock() - this.sliceStart < this.sliceMs) return;
    await this.pause();
  }

  /**
   * Ends the slice: yields to the event loop, and while the user is not idle
   * waits until they are.
   */
  async pause(): Promise<void> {
    this.sliceEnd();
    await this.yieldNow();
    this.check();
    if (this.idle !== undefined && !this.idle.idle()) {
      this.pauses += 1;
      await this.idle.idleWait(this.signal).catch(() => undefined);
      this.check();
    }
    this.sliceStart = this.clock();
  }

  /**
   * Waits for idle before the scan starts.
   *
   * @returns Resolves when the scan may start.
   */
  async start(): Promise<void> {
    if (this.idle !== undefined && !this.idle.idle()) await this.pause();
    this.sliceStart = this.clock();
  }

  /** Records the last slice when the scan ends. */
  finish(): void {
    this.sliceEnd();
    this.sliceStart = this.clock();
  }

  /** Throws when cancelled. */
  check(): void {
    if (this.signal?.aborted === true) throw new ProjectTextureScanCancelled();
  }

  /** Records the slice that ends now. */
  private sliceEnd(): void {
    this.maxSliceMs = Math.max(this.maxSliceMs, this.clock() - this.sliceStart);
    this.slices += 1;
  }
}

/**
 * Gives the event loop a full turn: scheduler.yield where the browser has it,
 * otherwise a message-channel task (unlike nested timers it is not throttled to
 * 4 ms), otherwise a timer.
 *
 * @returns Resolves in a later task.
 */
export function projectTextureScanYield(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (typeof scheduler?.yield === 'function') return scheduler.yield();
  if (typeof MessageChannel !== 'undefined')
    return new Promise((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => {
        channel.port1.close();
        resolve();
      };
      channel.port2.postMessage(null);
    });
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Finds 64-character lowercase hex runs (SHA-256 hashes, as in embedded texture
 * ids) in bytes fed piece by piece, without decoding text or running a regular
 * expression: one pass over the bytes, so a file without any hash costs a
 * single cheap loop. A run longer than 64 is not a hash.
 */
export class ProjectTextureHashScanner {
  private readonly run = new Uint8Array(PROJECT_TEXTURE_SCAN_HASH_LENGTH);
  private length = 0;

  /**
   * Creates a scanner adding to a set.
   *
   * @param into Hashes found.
   */
  constructor(readonly into: Set<string> = new Set()) {}

  /**
   * Searches the next bytes.
   *
   * @param bytes Bytes following the previous ones.
   */
  push(bytes: Uint8Array): void {
    const run = this.run;
    let length = this.length;
    for (let i = 0; i < bytes.length; i += 1) {
      const byte = bytes[i]!;
      if ((byte >= 0x30 && byte <= 0x39) || (byte >= 0x61 && byte <= 0x66)) {
        if (length < PROJECT_TEXTURE_SCAN_HASH_LENGTH) run[length] = byte;
        length += 1;
      } else {
        if (length === PROJECT_TEXTURE_SCAN_HASH_LENGTH) this.add();
        length = 0;
      }
    }
    this.length = length;
  }

  /**
   * Ends the input.
   *
   * @returns Hashes found.
   */
  end(): Set<string> {
    if (this.length === PROJECT_TEXTURE_SCAN_HASH_LENGTH) this.add();
    this.length = 0;
    return this.into;
  }

  /** Adds the current run. */
  private add(): void {
    this.into.add(String.fromCharCode(...this.run));
  }
}

/**
 * Collects the hashes a file names, reading it one chunk at a time and pacing
 * between chunks, so a large file never blocks the editor or sits in memory as
 * one string.
 *
 * @param blob File.
 * @param pace Pace of the scan.
 * @param into Hashes found.
 * @returns The same set.
 */
export async function projectTextureScanBlob(
  blob: Blob,
  pace: ProjectTextureScanPace,
  into: Set<string> = new Set(),
): Promise<Set<string>> {
  const scanner = new ProjectTextureHashScanner(into);
  for (let start = 0; start < blob.size; start += PROJECT_TEXTURE_SCAN_CHUNK_BYTES) {
    const end = Math.min(blob.size, start + PROJECT_TEXTURE_SCAN_CHUNK_BYTES);
    scanner.push(new Uint8Array(await blob.slice(start, end).arrayBuffer()));
    await pace.pace();
  }
  return scanner.end();
}
