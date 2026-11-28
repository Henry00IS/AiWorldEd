import type { ImageManagerHandleRecord } from './image_manager_entry.js';

/** Where a handle gives its claim back (the manager). */
export interface ImageManagerHandleOwner {
  readyWait(record: ImageManagerHandleRecord, callback: (value: unknown) => void): void;
  handleRelease(handle: object, record: ImageManagerHandleRecord): void;
}

/**
 * A claim on one level of an image. The level stays loaded while any handle
 * holds it; release() gives the claim back (calling it again does nothing).
 */
export class ImageManagerHandle<T> {
  private record: ImageManagerHandleRecord | null;

  /** @internal Created by {@link ManagerImage}. */
  constructor(
    private readonly manager: ImageManagerHandleOwner,
    record: ImageManagerHandleRecord,
    /**
     * Settles with the level's value (null when it could not be made) once
     * loaded.
     */
    readonly ready: Promise<T | null>,
    private readonly read: () => T | null,
  ) {
    this.record = record;
  }

  /** Key of the image. */
  get key(): string {
    return this.record?.entry.key ?? '';
  }

  /** The level's value while it is loaded and the handle is held, else null. */
  get value(): T | null {
    return this.record === null ? null : this.read();
  }

  /** Whether release() was called. */
  get released(): boolean {
    return this.record === null;
  }

  /**
   * Calls back as soon as the level is loaded (synchronously from the load,
   * unlike {@link ready}); at once when it already is.
   *
   * @param callback Receives the value, or null when it could not be made.
   */
  onReady(callback: (value: T | null) => void): void {
    if (this.record === null) return;
    this.manager.readyWait(this.record, callback as (value: unknown) => void);
  }

  /** Gives the claim back; idempotent. */
  release(): void {
    const record = this.record;
    if (record === null) return;
    this.record = null;
    this.manager.handleRelease(this, record);
  }
}
