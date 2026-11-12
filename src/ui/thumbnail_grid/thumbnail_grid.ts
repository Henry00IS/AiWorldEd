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

/** Decoded thumbnails kept for redraws, at most. */
const THUMBNAIL_GRID_CACHE_SIZE = 300;

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
 * Creates a thumbnail element.
 *
 * @param className Extra class (the browser's own look), or ''.
 * @param url Image URL, or null for none yet.
 * @param fit How the image fills the square.
 * @returns Thumbnail element.
 */
export function thumbnailGridThumbCreate(className: string, url: string | null, fit: ThumbnailGridFit): HTMLElement {
  thumbnailGridStylesEnsure();
  const thumb = document.createElement('div');
  thumb.className = className === '' ? THUMBNAIL_GRID_THUMB_CLASS : `${THUMBNAIL_GRID_THUMB_CLASS} ${className}`;
  thumb.dataset['thumbnailFit'] = fit;
  thumbnailGridThumbSet(thumb, url);
  return thumb;
}

/**
 * Sets or clears a thumbnail's image; it is drawn by the grid's next draw.
 *
 * @param thumb Thumbnail element.
 * @param url Image URL, or null.
 */
export function thumbnailGridThumbSet(thumb: HTMLElement, url: string | null): void {
  if ((thumb.dataset['thumbnailUrl'] ?? null) === url) return;
  thumb.querySelector(':scope > canvas')?.remove();
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
      void thumbnailGridBitmap(url, device, fit).then((bitmap) => {
        if (thumb.dataset['thumbnailDrawn'] !== key) return;
        thumb.querySelector(':scope > canvas')?.remove();
        if (bitmap === null) return;
        const canvas = document.createElement('canvas');
        canvas.width = device;
        canvas.height = device;
        canvas
          .getContext('2d')
          ?.drawImage(bitmap, Math.round((device - bitmap.width) / 2), Math.round((device - bitmap.height) / 2));
        thumb.appendChild(canvas);
      });
    });
  }

  /** Stops following the grid. */
  dispose(): void {
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
 * @returns Bitmap (at most the square), or null when it cannot be drawn.
 */
function thumbnailGridBitmap(url: string, device: number, fit: ThumbnailGridFit): Promise<ImageBitmap | null> {
  const key = `${device}|${fit}|${url}`;
  const cached = thumbnailGridCache.get(key);
  if (cached !== undefined) {
    thumbnailGridCache.delete(key);
    thumbnailGridCache.set(key, cached);
    return cached;
  }
  const made = thumbnailGridBitmapMake(url, device, fit);
  thumbnailGridCache.set(key, made);
  while (thumbnailGridCache.size > THUMBNAIL_GRID_CACHE_SIZE) {
    const oldest = thumbnailGridCache.keys().next().value as string;
    void thumbnailGridCache.get(oldest)?.then((bitmap) => bitmap?.close());
    thumbnailGridCache.delete(oldest);
  }
  return made;
}

/**
 * Decodes an image and resamples it with high quality.
 *
 * @param url Image URL.
 * @param device Square side in device pixels.
 * @param fit How the image fills it.
 * @returns Bitmap, or null.
 */
async function thumbnailGridBitmapMake(
  url: string,
  device: number,
  fit: ThumbnailGridFit,
): Promise<ImageBitmap | null> {
  if (typeof createImageBitmap !== 'function' || typeof Image === 'undefined') return null;
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    const width = image.naturalWidth || device;
    const height = image.naturalHeight || device;
    if (fit === 'cover') {
      const side = Math.min(width, height);
      return await createImageBitmap(image, (width - side) / 2, (height - side) / 2, side, side, {
        resizeWidth: device,
        resizeHeight: device,
        resizeQuality: 'high',
      });
    }
    const scale = Math.min(device / width, device / height);
    return await createImageBitmap(image, {
      resizeWidth: Math.max(1, Math.round(width * scale)),
      resizeHeight: Math.max(1, Math.round(height * scale)),
      resizeQuality: 'high',
    });
  } catch {
    return null;
  }
}
