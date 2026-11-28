/**
 * Square image thumbnails in a grid, shared by the texture browser and the
 * project browser so both look the same: columns are snapped to whole CSS
 * pixels (no fractional tracks that blur or shimmer), and each thumbnail is a
 * canvas holding the image resampled once, with high quality, to the exact
 * device pixels it covers (its CSS size times devicePixelRatio). Moving to a
 * screen with another pixel ratio, or zooming, redraws at the new size.
 */

/** Class of a thumbnail element. */
export const THUMBNAIL_GRID_THUMB_CLASS = 'ui-thumbnail';

/** CSS variable holding the thumbnail size of a grid (whole pixels). */
export const THUMBNAIL_GRID_SIZE_VARIABLE = '--ui-thumbnail-px';

/** Style element id of the thumbnail CSS. */
const THUMBNAIL_GRID_STYLE_ID = 'ui-thumbnail-stylesheet';

/**
 * Decoded thumbnails kept for redraws, at most. Only tiles in or near view
 * exist (see ThumbnailGridWindow), so this just lets a tile that scrolls back
 * in draw at once instead of decoding its image again; older ones are closed.
 */
const THUMBNAIL_GRID_CACHE_SIZE = 128;

/** How an image fills its square: cropped to fill it, or whole inside it. */
export type ThumbnailGridFit = 'cover' | 'contain';

/** Column sizing of a thumbnail grid. */
export interface ThumbnailGridOptions {
  /** Narrowest column, in CSS pixels. */
  minColumnPx: number;
  /** Gap between columns, in CSS pixels (as in the grid's CSS). */
  gapPx: number;
  /** Tile width around the thumbnail (padding plus border, both sides). */
  tileChromePx: number;
}

/**
 * The file behind a thumbnail's URL, when its owner knows it: the image is then
 * decoded straight from it (see thumbnailGridSourceDecode).
 */
const thumbnailGridSources = new WeakMap<HTMLElement, Blob>();

/** Resampled thumbnails by URL, size and fit, oldest first. */
const thumbnailGridCache = new Map<string, Promise<ImageBitmap | null>>();

/** Ensures the shared thumbnail CSS exists. */
export function thumbnailGridStylesEnsure(): void {
  if (typeof document === 'undefined' || document.getElementById(THUMBNAIL_GRID_STYLE_ID) !== null) return;
  const style = document.createElement('style');
  style.id = THUMBNAIL_GRID_STYLE_ID;
  style.textContent = `
.${THUMBNAIL_GRID_THUMB_CLASS} { position: relative; box-sizing: border-box; flex-shrink: 0; overflow: hidden; border-radius: 2px;
  width: var(${THUMBNAIL_GRID_SIZE_VARIABLE}, 100%); height: var(${THUMBNAIL_GRID_SIZE_VARIABLE}, auto); aspect-ratio: 1 / 1; }
.${THUMBNAIL_GRID_THUMB_CLASS} > canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }`.trim();
  document.head.appendChild(style);
}

/**
 * Removes a thumbnail's drawing and frees its pixels at once (a canvas of zero
 * size has no backing store, whenever the garbage collector gets to it).
 *
 * @param thumb Thumbnail element.
 */
function thumbnailGridCanvasRelease(thumb: Element): void {
  thumb.querySelectorAll(':scope > canvas').forEach((canvas) => {
    (canvas as HTMLCanvasElement).width = 0;
    (canvas as HTMLCanvasElement).height = 0;
    canvas.remove();
  });
}

/**
 * Lets go of every image a tile holds: the drawings of its thumbnails are freed
 * and their image URLs forgotten, so nothing in the element refers to an image
 * any more (the tile is about to be dropped).
 *
 * @param root Tile element (or a thumbnail itself).
 */
export function thumbnailGridTileRelease(root: HTMLElement): void {
  const thumbs = root.matches(`.${THUMBNAIL_GRID_THUMB_CLASS}`)
    ? [root]
    : [...root.querySelectorAll<HTMLElement>(`.${THUMBNAIL_GRID_THUMB_CLASS}`)];
  for (const thumb of thumbs) {
    thumbnailGridCanvasRelease(thumb);
    thumbnailGridSources.delete(thumb);
    delete thumb.dataset['thumbnailUrl'];
    delete thumb.dataset['thumbnailDrawn'];
  }
}

/**
 * Creates a thumbnail element.
 *
 * @param className Extra class (the browser's own look), or ''.
 * @param url Image URL, or null for none yet.
 * @param fit How the image fills the square.
 * @param source The file behind the URL, when known.
 * @returns Thumbnail element.
 */
export function thumbnailGridThumbCreate(
  className: string,
  url: string | null,
  fit: ThumbnailGridFit,
  source: Blob | null = null,
): HTMLElement {
  thumbnailGridStylesEnsure();
  const thumb = document.createElement('div');
  thumb.className = className === '' ? THUMBNAIL_GRID_THUMB_CLASS : `${THUMBNAIL_GRID_THUMB_CLASS} ${className}`;
  thumb.dataset['thumbnailFit'] = fit;
  thumbnailGridThumbSet(thumb, url, source);
  return thumb;
}

/**
 * Sets or clears a thumbnail's image; it is drawn by the grid's next draw.
 *
 * @param thumb Thumbnail element.
 * @param url Image URL, or null.
 * @param source The file behind the URL, when known.
 */
export function thumbnailGridThumbSet(thumb: HTMLElement, url: string | null, source: Blob | null = null): void {
  if (url === null || source === null) thumbnailGridSources.delete(thumb);
  else thumbnailGridSources.set(thumb, source);
  if ((thumb.dataset['thumbnailUrl'] ?? null) === url) return;
  thumbnailGridCanvasRelease(thumb);
  delete thumb.dataset['thumbnailDrawn'];
  if (url === null) delete thumb.dataset['thumbnailUrl'];
  else thumb.dataset['thumbnailUrl'] = url;
}

/**
 * Keeps a grid's columns on whole pixels and its thumbnails drawn at device
 * resolution.
 */
export class ThumbnailGrid {
  private readonly observer: ResizeObserver | null;
  private sizePx = 0;
  private ratio = 0;
  private columns = 0;
  private readonly layoutListeners = new Set<() => void>();
  private readonly resized = (): void => this.layout();

  /**
   * Binds a grid element (display: grid, its gap as in the options).
   *
   * @param grid Grid element.
   * @param options Column sizing.
   */
  constructor(
    private readonly grid: HTMLElement,
    private readonly options: ThumbnailGridOptions,
  ) {
    thumbnailGridStylesEnsure();
    this.observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(this.resized);
    this.observer?.observe(grid);
    // Zoom and moving between screens change devicePixelRatio and fire resize.
    if (typeof window !== 'undefined') window.addEventListener('resize', this.resized);
  }

  /**
   * Returns the thumbnail size in CSS pixels (0 before the first layout).
   *
   * @returns Size.
   */
  thumbnailPx(): number {
    return this.sizePx;
  }

  /**
   * Returns the number of columns of the last layout (0 before the first one,
   * or while the grid has no width).
   *
   * @returns Column count.
   */
  columnCount(): number {
    return this.columns;
  }

  /**
   * Returns the gap between tiles in CSS pixels.
   *
   * @returns Gap.
   */
  gapPx(): number {
    return this.options.gapPx;
  }

  /**
   * Calls a listener after every layout (columns or thumbnail size may have
   * changed), before the thumbnails are drawn.
   *
   * @param listener Called after the columns are set.
   * @returns Removes the listener.
   */
  layoutListen(listener: () => void): () => void {
    this.layoutListeners.add(listener);
    return () => this.layoutListeners.delete(listener);
  }

  /**
   * Snaps the columns to whole pixels for the grid's current width, then draws
   * thumbnails that are new or whose size changed.
   */
  layout(): void {
    const grid = this.grid;
    const style = getComputedStyle(grid);
    const inner = grid.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
    if (!(inner > 0)) return;
    const { minColumnPx, gapPx, tileChromePx } = this.options;
    const columns = Math.max(1, Math.floor((inner + gapPx) / (minColumnPx + gapPx)));
    const widest = Math.max(1, Math.floor((inner - gapPx * (columns - 1)) / columns));
    const ratio = thumbnailGridPixelRatio();
    const size = thumbnailGridSizeSnap(Math.max(1, widest - tileChromePx), ratio);
    // Tiles exactly fit their thumbnail (no half-pixel centering); spare pixels end the row.
    const template = `repeat(${columns}, ${size + tileChromePx}px)`;
    if (grid.style.gridTemplateColumns !== template) grid.style.gridTemplateColumns = template;
    if (size !== this.sizePx) grid.style.setProperty(THUMBNAIL_GRID_SIZE_VARIABLE, `${size}px`);
    this.sizePx = size;
    this.ratio = ratio;
    this.columns = columns;
    this.layoutListeners.forEach((listener) => listener());
    this.draw();
  }

  /** Draws every thumbnail of the grid not yet drawn at the current size. */
  draw(): void {
    if (this.sizePx === 0) return this.layout();
    const device = Math.round(this.sizePx * this.ratio);
    this.grid.querySelectorAll<HTMLElement>(`.${THUMBNAIL_GRID_THUMB_CLASS}[data-thumbnail-url]`).forEach((thumb) => {
      const url = thumb.dataset['thumbnailUrl']!;
      const fit: ThumbnailGridFit = thumb.dataset['thumbnailFit'] === 'contain' ? 'contain' : 'cover';
      const key = `${device}|${fit}|${url}`;
      if (thumb.dataset['thumbnailDrawn'] === key) return;
      thumb.dataset['thumbnailDrawn'] = key;
      void thumbnailGridBitmap(url, device, fit, thumbnailGridSources.get(thumb)).then((bitmap) => {
        if (thumb.dataset['thumbnailDrawn'] !== key) return;
        thumbnailGridCanvasRelease(thumb);
        if (bitmap === null) return;
        const canvas = document.createElement('canvas');
        canvas.width = device;
        canvas.height = device;
        try {
          canvas
            .getContext('2d')
            ?.drawImage(bitmap, Math.round((device - bitmap.width) / 2), Math.round((device - bitmap.height) / 2));
        } catch {
          // The bitmap was closed meanwhile (evicted from the cache): draw again next time.
          delete thumb.dataset['thumbnailDrawn'];
          return;
        }
        thumb.appendChild(canvas);
      });
    });
  }

  /** Stops following the grid. */
  dispose(): void {
    this.layoutListeners.clear();
    this.observer?.disconnect();
    if (typeof window !== 'undefined') window.removeEventListener('resize', this.resized);
  }
}

/**
 * Returns the screen's device pixels per CSS pixel.
 *
 * @returns Ratio (1 without a window).
 */
function thumbnailGridPixelRatio(): number {
  return typeof window === 'undefined' || !(window.devicePixelRatio > 0) ? 1 : window.devicePixelRatio;
}

/**
 * Shrinks a size by a few pixels at most so it covers whole device pixels (at
 * 150% an even size: 82 CSS px = 123 device px), when one is that close.
 *
 * @param size Size in CSS pixels.
 * @param ratio Device pixel ratio.
 * @returns Size in CSS pixels.
 */
export function thumbnailGridSizeSnap(size: number, ratio: number): number {
  for (let candidate = size; candidate > Math.max(0, size - 4); candidate -= 1)
    if (Math.abs(candidate * ratio - Math.round(candidate * ratio)) < 0.01) return candidate;
  return size;
}

/**
 * Resamples an image to a square of device pixels, cached.
 *
 * @param url Image URL.
 * @param device Square side in device pixels.
 * @param fit How the image fills it.
 * @param source The file behind the URL, when known.
 * @returns Bitmap (at most the square), or null when it cannot be drawn.
 */
function thumbnailGridBitmap(
  url: string,
  device: number,
  fit: ThumbnailGridFit,
  source: Blob | undefined,
): Promise<ImageBitmap | null> {
  const key = `${device}|${fit}|${url}`;
  const cached = thumbnailGridCache.get(key);
  if (cached !== undefined) {
    thumbnailGridCache.delete(key);
    thumbnailGridCache.set(key, cached);
    return cached;
  }
  const made = thumbnailGridBitmapMake(url, device, fit, source);
  thumbnailGridCache.set(key, made);
  while (thumbnailGridCache.size > THUMBNAIL_GRID_CACHE_SIZE) {
    const oldest = thumbnailGridCache.keys().next().value as string;
    void thumbnailGridCache.get(oldest)?.then((bitmap) => bitmap?.close());
    thumbnailGridCache.delete(oldest);
  }
  return made;
}

/**
 * Decodes an image and resamples it with high quality. The full-size decode is
 * closed as soon as the thumbnail exists, so only the small bitmap is kept.
 *
 * @param url Image URL.
 * @param device Square side in device pixels.
 * @param fit How the image fills it.
 * @param file The file behind the URL, when known.
 * @returns Bitmap, or null.
 */
async function thumbnailGridBitmapMake(
  url: string,
  device: number,
  fit: ThumbnailGridFit,
  file: Blob | undefined,
): Promise<ImageBitmap | null> {
  if (typeof createImageBitmap !== 'function') return null;
  try {
    const source = await thumbnailGridSourceDecode(url, file);
    if (source === null) return null;
    try {
      const width = source.width || device;
      const height = source.height || device;
      if (fit === 'cover') {
        const side = Math.min(width, height);
        return await createImageBitmap(source, (width - side) / 2, (height - side) / 2, side, side, {
          resizeWidth: device,
          resizeHeight: device,
          resizeQuality: 'high',
        });
      }
      const scale = Math.min(device / width, device / height);
      return await createImageBitmap(source, {
        resizeWidth: Math.max(1, Math.round(width * scale)),
        resizeHeight: Math.max(1, Math.round(height * scale)),
        resizeQuality: 'high',
      });
    } finally {
      if ('close' in source) source.close();
      else source.removeAttribute('src');
    }
  } catch {
    return null;
  }
}

/**
 * Decodes the full image. A file the owner knows is decoded straight into a
 * bitmap that can be closed at once, and the browser keeps no copy of it, as it
 * does for the decode of an image element; anything else (an object URL without
 * its file, a data URL) is decoded by an image element.
 *
 * @param url Image URL.
 * @param file The file behind the URL, when known.
 * @returns Decoded image, or null when it cannot be decoded.
 */
async function thumbnailGridSourceDecode(
  url: string,
  file: Blob | undefined,
): Promise<ImageBitmap | HTMLImageElement | null> {
  if (file !== undefined) {
    try {
      return await createImageBitmap(file);
    } catch {
      // Not decodable from the file: the image element reports it the same way.
    }
  }
  if (typeof Image === 'undefined') return null;
  const image = new Image();
  image.decoding = 'async';
  image.src = url;
  await image.decode();
  return image;
}
