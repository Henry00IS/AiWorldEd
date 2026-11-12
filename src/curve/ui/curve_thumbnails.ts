import { curveFileRead } from '@/curve/model/curve_file.js';
import { curveDrawThumbnail } from './curve_draw.js';

/** One cached thumbnail: ready, failed (null) or still loading (undefined). */
interface CurveThumbnailEntry {
  /** File stamp the thumbnail was drawn for. */
  stamp: number;
  /** Data URL, null when the file is not a valid curve, undefined while loading. */
  url: string | null | undefined;
}

/**
 * Draws project browser thumbnails of curve files in the background and caches
 * them per path and modification time.
 */
export class CurveThumbnails {
  private readonly entries = new Map<string, CurveThumbnailEntry>();

  /**
   * Creates the cache.
   *
   * @param onReady Called when thumbnails finished drawing.
   */
  constructor(private readonly onReady: () => void) {}

  /**
   * Returns a curve file's thumbnail, starting to draw it when needed.
   *
   * @param path Project path.
   * @param stamp Modification time; a new stamp redraws.
   * @param read Reads the file text.
   * @returns Data URL, or null while loading or for invalid files.
   */
  get(path: string, stamp: number, read: () => Promise<string>): string | null {
    const entry = this.entries.get(path);
    if (entry?.stamp === stamp) return entry.url ?? null;
    this.entries.set(path, { stamp, url: undefined });
    void read()
      .then((text) => this.drawn(path, stamp, text))
      .catch(() => this.finish(path, stamp, null));
    return null;
  }

  /**
   * Draws a loaded file.
   *
   * @param path Project path.
   * @param stamp Modification time.
   * @param text File text.
   */
  private drawn(path: string, stamp: number, text: string): void {
    const result = curveFileRead(text);
    this.finish(path, stamp, 'error' in result ? null : curveDrawThumbnail(result.curve));
  }

  /**
   * Stores a finished thumbnail unless the file changed meanwhile.
   *
   * @param path Project path.
   * @param stamp Modification time.
   * @param url Data URL or null.
   */
  private finish(path: string, stamp: number, url: string | null): void {
    if (this.entries.get(path)?.stamp !== stamp) return;
    this.entries.set(path, { stamp, url });
    this.onReady();
  }
}
