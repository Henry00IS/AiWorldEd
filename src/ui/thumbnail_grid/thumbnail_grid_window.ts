import { thumbnailGridTileRelease } from './thumbnail_grid.js';
import {
  thumbnailGridRowsBuild,
  thumbnailGridRowsWindow,
  type ThumbnailGridRow,
} from './thumbnail_grid_window_metrics.js';

/** Rows built above and below the visible ones (as the outliner's overscan). */
const THUMBNAIL_GRID_WINDOW_OVERSCAN_ROWS = 2;

/** Most items built while the grid has no size yet (hidden, or not laid out). */
const THUMBNAIL_GRID_WINDOW_UNMEASURED_LIMIT = 96;

/** Row height assumed until a built tile can be measured. */
const THUMBNAIL_GRID_WINDOW_TILE_ESTIMATE_PX = 120;

/** Height assumed for a full-width item until it has been built and measured. */
const THUMBNAIL_GRID_WINDOW_FULL_ESTIMATE_PX = 24;

/** Most passes of building and measuring when sizes turn out different. */
const THUMBNAIL_GRID_WINDOW_PASSES = 3;

/** Attribute of the blank elements that stand in for the rows not built. */
export const THUMBNAIL_GRID_WINDOW_SPACER_ATTRIBUTE = 'data-thumbnail-spacer';

/** The grid layout a window follows (implemented by ThumbnailGrid). */
export interface ThumbnailGridWindowSource {
  /** Columns of the last layout, 0 while the grid has no width. */
  columnCount(): number;
  /** Gap between tiles in CSS pixels. */
  gapPx(): number;
  /** Draws the thumbnails of the tiles that exist and are not drawn yet. */
  draw(): void;
  /** Calls a listener after each layout; returns the remover. */
  layoutListen(listener: () => void): () => void;
}

/** How a window builds its tiles. */
export interface ThumbnailGridWindowOptions<T> {
  /** Stable id of an item (survives re-sorting and rebuilding). */
  key: (item: T) => string;
  /** Builds the tile of an item. */
  create: (item: T, index: number) => HTMLElement;
  /** Tells whether an item spans the whole row, such as a heading. */
  isFull?: (item: T) => boolean;
  /** Rows built above and below the visible ones. */
  overscanRows?: number;
}

/** A tile that was in view and where it sat, from the top of the viewport. */
export interface ThumbnailGridWindowAnchor {
  key: string;
  offset: number;
}

/**
 * Builds only the tiles of a thumbnail grid that are in or near view, like the
 * outliner's virtual list builds only its visible rows: the rest of the grid is
 * two blank spacers of the exact height of the rows they stand in for, so the
 * grid, its native scrolling, scroll bar and layout stay what they were. A tile
 * that scrolls out is removed from the DOM and releases its image (see
 * thumbnailGridTileRelease); scrolling back builds it, and draws it, again.
 *
 * The tiles must be direct children of the grid and follow each other without
 * other children between them; anything else the owner puts in the grid (a
 * message) goes after them.
 */
export class ThumbnailGridWindow<T> {
  private items: readonly T[] = [];
  private keys = new Map<string, number>();
  private rows: ThumbnailGridRow[] = [];
  private rowOf: number[] = [];
  private rowsDirty = true;
  private tileHeightPx = 0;
  private readonly fullHeights = new Map<string, number>();
  private paddingTopPx = 0;
  private measureWanted = true;
  private geometryKnown = false;
  private readonly mounted = new Map<number, HTMLElement>();
  private mountedFirst = 0;
  private mountedEnd = 0;
  private readonly spacerTop = ThumbnailGridWindow.spacerCreate();
  private readonly spacerBottom = ThumbnailGridWindow.spacerCreate();
  private readonly overscanRows: number;
  private readonly unlistenLayout: () => void;
  private readonly scrolled = (): void => this.refresh();
  private readonly keyDown = (event: KeyboardEvent): void => this.tabHandle(event);
  private disposed = false;

  /**
   * Follows a grid element.
   *
   * @param grid Grid element (the scroller).
   * @param source Column layout of the grid.
   * @param options How to build tiles.
   */
  constructor(
    private readonly grid: HTMLElement,
    private readonly source: ThumbnailGridWindowSource,
    private readonly options: ThumbnailGridWindowOptions<T>,
  ) {
    this.overscanRows = options.overscanRows ?? THUMBNAIL_GRID_WINDOW_OVERSCAN_ROWS;
    grid.addEventListener('scroll', this.scrolled, { passive: true });
    grid.addEventListener('keydown', this.keyDown);
    // Columns or the thumbnail size changed: rows hold other items, at another height.
    this.unlistenLayout = source.layoutListen(() => {
      this.rowsDirty = true;
      this.measureWanted = true;
      this.refresh();
    });
  }

  /**
   * Returns the items of the grid.
   *
   * @returns Items in grid order.
   */
  itemsGet(): readonly T[] {
    return this.items;
  }

  /**
   * Returns the tiles that exist right now.
   *
   * @returns Tiles by item index.
   */
  mountedGet(): ReadonlyMap<number, HTMLElement> {
    return this.mounted;
  }

  /**
   * Returns the index of an item.
   *
   * @param key Item key.
   * @returns Index, or -1.
   */
  indexOfKey(key: string): number {
    return this.keys.get(key) ?? -1;
  }

  /**
   * Returns the tile of an item, when it exists.
   *
   * @param key Item key.
   * @returns Tile, or null while it is out of view.
   */
  tileOfKey(key: string): HTMLElement | null {
    const index = this.keys.get(key);
    return index === undefined ? null : (this.mounted.get(index) ?? null);
  }

  /**
   * Replaces the items. Every tile is built again (a tile may show another name
   * or image although its key is the same), but only those in view.
   *
   * @param items Items in grid order.
   */
  itemsSet(items: readonly T[]): void {
    if (this.disposed) return;
    this.items = items;
    this.keys = new Map(items.map((item, index) => [this.options.key(item), index]));
    this.unmountAll();
    this.rowsDirty = true;
    this.measureWanted = true;
    this.refresh();
  }

  /** Builds the tiles of the rows in view again, with the items' current state. */
  remountVisible(): void {
    if (this.disposed) return;
    this.unmountAll();
    this.refresh();
  }

  /**
   * Builds and removes tiles for the current scroll offset and size. Cheap
   * while the same rows are in view.
   */
  refresh(): void {
    if (this.disposed) return;
    if (this.items.length === 0) {
      this.unmountAll();
      return;
    }
    const columns = this.source.columnCount();
    const viewport = this.grid.clientHeight;
    this.geometryKnown = columns > 0 && viewport > 0;
    if (!this.geometryKnown) return this.unmeasuredMount();
    for (let pass = 0; pass < THUMBNAIL_GRID_WINDOW_PASSES; pass++) {
      if (this.measureWanted) this.paddingTopPx = parseFloat(getComputedStyle(this.grid).paddingTop) || 0;
      this.rowsEnsure(columns);
      const range = thumbnailGridRowsWindow(
        this.rows,
        this.grid.scrollTop - this.paddingTopPx,
        viewport,
        this.overscanRows,
      );
      if (range === null) return;
      this.rangeMount(range.first, range.last);
      if (!this.measureWanted) return;
      this.measureWanted = false;
      // Sizes turned out different from the estimate: lay the rows out again.
      if (!this.measure()) return;
      this.rowsDirty = true;
    }
  }

  /**
   * Returns the distance from the top of the grid's content to an item's row
   * (the scroll offset that puts the row at the top of the viewport), when the
   * grid has a size.
   *
   * @param index Item index.
   * @returns Offset, or null.
   */
  itemTopPx(index: number): number | null {
    if (!this.geometryKnown || this.rowsDirty) this.refresh();
    const row = this.rows[this.rowOf[index] ?? -1];
    return !this.geometryKnown || row === undefined ? null : this.paddingTopPx + row.topPx;
  }

  /**
   * Lists the tiles from the first one in view onwards with their distance from
   * the top of the viewport, to find the same tiles again after the items
   * changed.
   *
   * @returns Anchors in grid order.
   */
  anchorsTake(): ThumbnailGridWindowAnchor[] {
    const anchors: ThumbnailGridWindowAnchor[] = [];
    this.refresh();
    if (this.geometryKnown) {
      const scroll = this.grid.scrollTop;
      for (let index = 0; index < this.items.length; index++) {
        const top = this.itemTopPx(index);
        const row = this.rows[this.rowOf[index]!];
        if (top === null || row === undefined) break;
        if (top + row.heightPx > scroll || anchors.length > 0)
          anchors.push({ key: this.options.key(this.items[index]!), offset: top - scroll });
      }
      return anchors;
    }
    const gridTop = this.grid.getBoundingClientRect().top;
    this.mounted.forEach((tile, index) => {
      const rect = tile.getBoundingClientRect();
      if (rect.bottom > gridTop || anchors.length > 0)
        anchors.push({ key: this.options.key(this.items[index]!), offset: rect.top - gridTop });
    });
    return anchors;
  }

  /**
   * Scrolls so the first anchor tile still listed sits where it did; without
   * one the scroll offset stays.
   *
   * @param anchors Anchors taken before the items changed.
   */
  anchorsRestore(anchors: readonly ThumbnailGridWindowAnchor[]): void {
    this.refresh();
    for (const anchor of anchors) {
      const index = this.keys.get(anchor.key);
      if (index === undefined) continue;
      const top = this.itemTopPx(index);
      if (top !== null) {
        this.grid.scrollTop = Math.max(0, top - anchor.offset);
      } else {
        const tile = this.mounted.get(index);
        if (tile === undefined) continue;
        const moved = tile.getBoundingClientRect().top - this.grid.getBoundingClientRect().top - anchor.offset;
        this.grid.scrollTop = Math.max(0, this.grid.scrollTop + moved);
      }
      this.refresh();
      return;
    }
  }

  /**
   * Scrolls the least that brings an item's row fully into view.
   *
   * @param index Item index.
   */
  scrollToIndex(index: number): void {
    const top = this.itemTopPx(index);
    const row = this.rows[this.rowOf[index] ?? -1];
    if (top === null || row === undefined) return;
    const scroll = this.grid.scrollTop;
    const bottom = top + row.heightPx;
    if (top < scroll) this.grid.scrollTop = top;
    else if (bottom > scroll + this.grid.clientHeight) this.grid.scrollTop = bottom - this.grid.clientHeight;
    this.refresh();
  }

  /** Stops following the grid and drops every tile. */
  dispose(): void {
    if (this.disposed) return;
    this.unmountAll();
    this.disposed = true;
    this.unlistenLayout();
    this.grid.removeEventListener('scroll', this.scrolled);
    this.grid.removeEventListener('keydown', this.keyDown);
  }

  /** Builds the first items while the grid has no size, without spacers. */
  private unmeasuredMount(): void {
    this.measureWanted = true;
    this.rangeApply(0, Math.min(this.items.length, THUMBNAIL_GRID_WINDOW_UNMEASURED_LIMIT), 0, 0);
  }

  /**
   * Lays the items out in rows for the current sizes, when they changed.
   *
   * @param columns Columns of the grid.
   */
  private rowsEnsure(columns: number): void {
    if (!this.rowsDirty) return;
    this.rowsDirty = false;
    const items = this.items;
    const full = (index: number): boolean => this.options.isFull?.(items[index]!) === true;
    this.rows = thumbnailGridRowsBuild({
      count: items.length,
      columns,
      gapPx: this.source.gapPx(),
      isFull: full,
      tileHeightPx: this.tileHeightPx > 0 ? this.tileHeightPx : THUMBNAIL_GRID_WINDOW_TILE_ESTIMATE_PX,
      fullHeightPx: (index) =>
        this.fullHeights.get(this.options.key(items[index]!)) ?? THUMBNAIL_GRID_WINDOW_FULL_ESTIMATE_PX,
    });
    this.rowOf = new Array<number>(items.length);
    this.rows.forEach((row, rowIndex) => {
      for (let index = row.first; index < row.end; index++) this.rowOf[index] = rowIndex;
    });
  }

  /**
   * Builds the tiles of rows, removing the others.
   *
   * @param firstRow First row to build.
   * @param lastRow Last row to build.
   */
  private rangeMount(firstRow: number, lastRow: number): void {
    const first = this.rows[firstRow]!;
    const last = this.rows[lastRow]!;
    const total = this.rows[this.rows.length - 1]!;
    const gap = this.source.gapPx();
    const before = firstRow > 0 ? first.topPx - gap : 0;
    const after =
      lastRow < this.rows.length - 1 ? total.topPx + total.heightPx - (last.topPx + last.heightPx) - gap : 0;
    this.rangeApply(first.first, last.end, before, after);
  }

  /**
   * Makes the tiles of an item range the only ones that exist.
   *
   * @param first First item to build.
   * @param end Item after the last one to build.
   * @param beforePx Height of the spacer standing in for the rows above.
   * @param afterPx Height of the spacer standing in for the rows below.
   */
  private rangeApply(first: number, end: number, beforePx: number, afterPx: number): void {
    if (
      first === this.mountedFirst &&
      end === this.mountedEnd &&
      this.mounted.size === end - first &&
      this.spacerTop.dataset['height'] === String(Math.max(0, beforePx)) &&
      this.spacerBottom.dataset['height'] === String(Math.max(0, afterPx))
    )
      return;
    let built = false;
    for (const [index, tile] of [...this.mounted]) {
      if (index >= first && index < end) continue;
      this.mounted.delete(index);
      this.tileDrop(tile);
    }
    for (let index = first; index < end; index++) {
      if (this.mounted.has(index)) continue;
      this.mounted.set(index, this.options.create(this.items[index]!, index));
      built = true;
    }
    this.mountedFirst = first;
    this.mountedEnd = end;
    this.spacerHeightSet(this.spacerTop, beforePx);
    this.spacerHeightSet(this.spacerBottom, afterPx);
    this.domSync();
    if (built) this.source.draw();
  }

  /**
   * Puts the tiles and spacers into the grid in order, without moving the ones
   * already in the right place (a tile that has focus keeps it).
   */
  private domSync(): void {
    const wanted: HTMLElement[] = [];
    if (this.spacerTop.dataset['height'] !== '0') wanted.push(this.spacerTop);
    for (let index = this.mountedFirst; index < this.mountedEnd; index++) {
      const tile = this.mounted.get(index);
      if (tile !== undefined) wanted.push(tile);
    }
    if (this.spacerBottom.dataset['height'] !== '0') wanted.push(this.spacerBottom);
    const keep = new Set<Node>(wanted);
    for (const spacer of [this.spacerTop, this.spacerBottom]) if (!keep.has(spacer)) spacer.remove();
    let cursor: ChildNode | null = this.grid.firstChild;
    // The tiles lead the grid: skip nothing, insert before whatever follows them.
    for (const element of wanted) {
      if (element === cursor) cursor = cursor.nextSibling;
      else this.grid.insertBefore(element, cursor);
    }
  }

  /**
   * Measures the height of a tile row and of full-width items from the elements
   * that exist.
   *
   * @returns True when a size differs from what the rows were laid out with.
   */
  private measure(): boolean {
    this.paddingTopPx = parseFloat(getComputedStyle(this.grid).paddingTop) || 0;
    let changed = false;
    let tileMeasured = false;
    this.mounted.forEach((tile, index) => {
      const full = this.options.isFull?.(this.items[index]!) === true;
      const height = tile.getBoundingClientRect().height;
      if (!(height > 0)) return;
      if (full) {
        const key = this.options.key(this.items[index]!);
        if (Math.abs((this.fullHeights.get(key) ?? 0) - height) > 0.01) {
          this.fullHeights.set(key, height);
          changed = true;
        }
      } else if (!tileMeasured) {
        tileMeasured = true;
        if (Math.abs(this.tileHeightPx - height) > 0.01) {
          this.tileHeightPx = height;
          changed = true;
        }
      }
    });
    return changed;
  }

  /** Removes every tile (the spacers too). */
  private unmountAll(): void {
    this.mounted.forEach((tile) => this.tileDrop(tile));
    this.mounted.clear();
    this.mountedFirst = 0;
    this.mountedEnd = 0;
    this.spacerTop.remove();
    this.spacerBottom.remove();
    this.spacerHeightSet(this.spacerTop, 0);
    this.spacerHeightSet(this.spacerBottom, 0);
  }

  /**
   * Removes a tile and lets go of its images.
   *
   * @param tile Tile element.
   */
  private tileDrop(tile: HTMLElement): void {
    thumbnailGridTileRelease(tile);
    tile.remove();
  }

  /**
   * Sets a spacer's height.
   *
   * @param spacer Spacer element.
   * @param heightPx Height in CSS pixels.
   */
  private spacerHeightSet(spacer: HTMLElement, heightPx: number): void {
    const text = String(Math.max(0, heightPx));
    if (spacer.dataset['height'] === text) return;
    spacer.dataset['height'] = text;
    spacer.style.height = `${Math.max(0, heightPx)}px`;
  }

  /**
   * Keeps Tab walking through all the tiles: from the last (first) tile built,
   * the next (previous) one is built and focused, as it would be with every
   * tile in the DOM.
   *
   * @param event Key event inside the grid.
   */
  private tabHandle(event: KeyboardEvent): void {
    if (event.key !== 'Tab' || event.ctrlKey || event.altKey || event.metaKey) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target === null) return;
    let index = -1;
    this.mounted.forEach((tile, tileIndex) => {
      if (tile === target) index = tileIndex;
    });
    if (index < 0) return;
    const next = index + (event.shiftKey ? -1 : 1);
    if (next < 0 || next >= this.items.length || this.mounted.has(next)) return;
    event.preventDefault();
    this.scrollToIndex(next);
    this.mounted.get(next)?.focus({ preventScroll: true });
  }

  /**
   * Creates a spacer element.
   *
   * @returns Blank element that takes no pointer events.
   */
  private static spacerCreate(): HTMLElement {
    const spacer = document.createElement('div');
    spacer.setAttribute(THUMBNAIL_GRID_WINDOW_SPACER_ATTRIBUTE, 'true');
    spacer.setAttribute('aria-hidden', 'true');
    spacer.style.cssText = 'grid-column:1 / -1;pointer-events:none;margin:0;padding:0;border:0;min-width:0';
    spacer.dataset['height'] = '0';
    return spacer;
  }
}
