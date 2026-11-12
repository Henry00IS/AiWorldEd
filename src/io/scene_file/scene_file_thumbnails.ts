import { sceneFileThumbnailRead } from '@/io/scene_file/scene_file_thumbnail.js';

/** One cached thumbnail: ready, failed (null) or still loading (undefined). */
interface SceneFileThumbnailEntry {
  /** File stamp the thumbnail was read for. */
  stamp: number;
  /** Object URL, null when the file has no thumbnail, undefined while loading. */
  url: string | null | undefined;
}

/**
 * Reads project browser thumbnails of level files in the background and caches
 * them per path and modification time.
 */
export class SceneFileThumbnails {
  private readonly entries = new Map<string, SceneFileThumbnailEntry>();

  /**
   * Creates the cache.
   *
   * @param onReady Called when thumbnails finished loading.
   */
  constructor(private readonly onReady: () => void) {}

  /**
   * Returns a level file's thumbnail, starting to read it when needed.
   *
   * @param path Project path.
   * @param stamp Modification time; a new stamp rereads.
   * @param read Reads the file bytes.
   * @returns Object URL, or null while loading or when the file has none.
   */
  get(path: string, stamp: number, read: () => Promise<Blob>): string | null {
    const entry = this.entries.get(path);
    if (entry?.stamp === stamp) return entry.url ?? null;
    this.forget(path);
    this.entries.set(path, { stamp, url: undefined });
    void read()
      .then((file) => this.loaded(path, stamp, file))
      .catch(() => this.finish(path, stamp, null));
    return null;
  }

  /**
   * Reads a loaded file's thumbnail entry.
   *
   * @param path Project path.
   * @param stamp Modification time.
   * @param file Level file.
   */
  private async loaded(path: string, stamp: number, file: Blob): Promise<void> {
    const thumbnail = await sceneFileThumbnailRead(file);
    this.finish(path, stamp, thumbnail === null ? null : URL.createObjectURL(thumbnail));
  }

  /**
   * Stores a finished thumbnail unless the file changed meanwhile.
   *
   * @param path Project path.
   * @param stamp Modification time.
   * @param url Object URL or null.
   */
  private finish(path: string, stamp: number, url: string | null): void {
    if (this.entries.get(path)?.stamp !== stamp) {
      if (url) URL.revokeObjectURL(url);
      return;
    }
    this.entries.set(path, { stamp, url });
    this.onReady();
  }

  /**
   * Drops a cached thumbnail and revokes its object URL.
   *
   * @param path Project path.
   */
  private forget(path: string): void {
    const url = this.entries.get(path)?.url;
    if (typeof url === 'string') URL.revokeObjectURL(url);
    this.entries.delete(path);
  }
}
