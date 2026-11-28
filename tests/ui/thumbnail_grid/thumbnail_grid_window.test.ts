import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  THUMBNAIL_GRID_THUMB_CLASS,
  thumbnailGridThumbCreate,
  thumbnailGridTileRelease,
} from '@/ui/thumbnail_grid/thumbnail_grid.js';
import {
  THUMBNAIL_GRID_WINDOW_SPACER_ATTRIBUTE,
  ThumbnailGridWindow,
  type ThumbnailGridWindowSource,
} from '@/ui/thumbnail_grid/thumbnail_grid_window.js';

/** One test item. */
interface Item {
  key: string;
  full?: boolean;
  label?: string;
}

const TILE_PX = 100;
const GAP_PX = 8;
const VIEWPORT_PX = 300;

/** A grid whose layout the test controls: scroll offset, viewport and columns. */
interface Fixture {
  grid: HTMLElement;
  win: ThumbnailGridWindow<Item>;
  created: string[];
  scrollTo: (y: number) => void;
  columnsSet: (columns: number) => void;
  draws: () => number;
}

/**
 * Builds a grid with a fake layout: tiles are 100 px high, full-width items 30
 * px, the viewport is 300 px, the gap 8 px and the padding 10 px.
 *
 * @param columns Columns of the grid (0: not laid out yet).
 * @param options Window options to override.
 * @returns Fixture.
 */
function fixtureCreate(columns: number, options: { overscanRows?: number } = {}): Fixture {
  const grid = document.createElement('div');
  grid.style.padding = '10px';
  document.body.appendChild(grid);
  let offset = 0;
  let cols = columns;
  let draws = 0;
  const listeners = new Set<() => void>();
  Object.defineProperty(grid, 'clientHeight', { configurable: true, get: () => (cols > 0 ? VIEWPORT_PX : 0) });
  Object.defineProperty(grid, 'scrollTop', {
    configurable: true,
    get: () => offset,
    set: (value: number) => {
      offset = Math.max(0, value);
      grid.dispatchEvent(new Event('scroll'));
    },
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.hasAttribute(THUMBNAIL_GRID_WINDOW_SPACER_ATTRIBUTE)) return new DOMRect(0, 0, 100, 0);
    return new DOMRect(0, 0, 100, this.dataset['full'] === 'true' ? 30 : TILE_PX);
  });
  const source: ThumbnailGridWindowSource = {
    columnCount: () => cols,
    gapPx: () => GAP_PX,
    draw: () => void (draws += 1),
    layoutListen: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const created: string[] = [];
  const win = new ThumbnailGridWindow<Item>(grid, source, {
    key: (item) => item.key,
    isFull: (item) => item.full === true,
    overscanRows: options.overscanRows ?? 1,
    create: (item) => {
      created.push(item.key);
      const tile = document.createElement('div');
      tile.dataset['key'] = item.key;
      tile.tabIndex = 0;
      if (item.full === true) tile.dataset['full'] = 'true';
      else {
        const thumb = thumbnailGridThumbCreate('t', `blob:${item.key}`, 'cover');
        thumb.dataset['thumbnailDrawn'] = 'x';
        thumb.appendChild(document.createElement('canvas'));
        tile.append(thumb, document.createTextNode(item.label ?? item.key));
      }
      return tile;
    },
  });
  return {
    grid,
    win,
    created,
    scrollTo: (y) => void (grid.scrollTop = y),
    columnsSet: (next) => {
      cols = next;
      listeners.forEach((listener) => listener());
    },
    draws: () => draws,
  };
}

/**
 * Makes items.
 *
 * @param count Item count.
 * @returns Items.
 */
function itemsOf(count: number): Item[] {
  return Array.from({ length: count }, (_, index) => ({ key: `i${index}` }));
}

/**
 * Lists the keys of the built tiles in DOM order.
 *
 * @param grid Grid element.
 * @returns Keys.
 */
function builtKeys(grid: HTMLElement): string[] {
  return [...grid.querySelectorAll<HTMLElement>('[data-key]')].map((tile) => tile.dataset['key']!);
}

/**
 * Reads a spacer's height.
 *
 * @param grid Grid element.
 * @returns Heights above and below (0 when there is no spacer).
 */
function spacers(grid: HTMLElement): { top: number; bottom: number } {
  const all = [...grid.querySelectorAll<HTMLElement>(`[${THUMBNAIL_GRID_WINDOW_SPACER_ATTRIBUTE}]`)];
  const first = grid.firstElementChild as HTMLElement | null;
  const last = grid.lastElementChild as HTMLElement | null;
  const height = (element: HTMLElement | null): number =>
    element !== null && all.includes(element) ? parseFloat(element.style.height) : 0;
  return { top: height(first), bottom: height(last) };
}

describe('ThumbnailGridWindow', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds only the rows in view and one overscan row on each side', () => {
    const { grid, win } = fixtureCreate(4);
    win.itemsSet(itemsOf(100));
    // 300 px shows rows 0-2 (rows are 108 px apart); row 3 is the overscan.
    expect(builtKeys(grid)).toEqual(itemsOf(16).map((item) => item.key));
    expect(win.mountedGet().size).toBe(16);
  });

  it('builds other rows as the grid scrolls and drops the ones that left', () => {
    const { grid, win, scrollTo } = fixtureCreate(4);
    win.itemsSet(itemsOf(100));
    scrollTo(10 + 108 * 10); // top of row 10
    // visible rows 10-12, overscan 9 and 13 → items 36..55
    const keys = builtKeys(grid);
    expect(keys[0]).toBe('i36');
    expect(keys.at(-1)).toBe('i55');
    expect(keys).toHaveLength(20);
    expect(grid.querySelector('[data-key="i0"]')).toBeNull();
    scrollTo(0);
    expect(builtKeys(grid)[0]).toBe('i0');
    expect(grid.querySelector('[data-key="i36"]')).toBeNull();
  });

  it('keeps the grid as tall as with every tile built, through two blank spacers', () => {
    const { grid, win, scrollTo } = fixtureCreate(4);
    win.itemsSet(itemsOf(100)); // 25 rows
    const total = 25 * TILE_PX + 24 * GAP_PX;
    // Built rows plus their gaps plus spacers (and the gaps around the spacers) equal the total.
    const check = (): void => {
      const { top, bottom } = spacers(grid);
      const built = [...grid.querySelectorAll('[data-key]')].length / 4;
      const gaps = built - 1 + (top > 0 ? 1 : 0) + (bottom > 0 ? 1 : 0);
      expect(top + bottom + built * TILE_PX + gaps * GAP_PX).toBeCloseTo(total, 5);
    };
    check();
    scrollTo(1200);
    check();
    scrollTo(100000);
    check();
    expect(spacers(grid).bottom).toBe(0);
    expect(spacers(grid).top).toBeGreaterThan(0);
  });

  it('shows rows with full-width items like the grid does and measures their height', () => {
    const { grid, win } = fixtureCreate(4);
    const items: Item[] = [...itemsOf(6), { key: 'heading', full: true }, ...itemsOf(40).slice(6)];
    win.itemsSet(items);
    // rows: [i0-3] [i4,i5] [heading] [i6-9] ...; 300 px + overscan 1 reach the second tile row
    expect(builtKeys(grid).slice(0, 9)).toEqual(['i0', 'i1', 'i2', 'i3', 'i4', 'i5', 'heading', 'i6', 'i7']);
    expect(win.itemTopPx(win.indexOfKey('i6'))).toBe(10 + 2 * (TILE_PX + GAP_PX) + 30 + GAP_PX);
  });

  it('releases the images of tiles that scroll out, and builds them again when they return', () => {
    const { grid, win, scrollTo, created } = fixtureCreate(4);
    win.itemsSet(itemsOf(100));
    const first = grid.querySelector<HTMLElement>('[data-key="i0"]')!;
    const thumb = first.querySelector<HTMLElement>(`.${THUMBNAIL_GRID_THUMB_CLASS}`)!;
    const canvas = thumb.querySelector('canvas')!;
    expect(thumb.dataset['thumbnailUrl']).toBe('blob:i0');
    scrollTo(10 + 108 * 20);
    // The tile left the DOM and holds no image reference or drawing any more.
    expect(first.isConnected).toBe(false);
    expect(thumb.dataset['thumbnailUrl']).toBeUndefined();
    expect(thumb.dataset['thumbnailDrawn']).toBeUndefined();
    expect(thumb.querySelector('canvas')).toBeNull();
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
    const buildsBefore = created.filter((key) => key === 'i0').length;
    scrollTo(0);
    const again = grid.querySelector<HTMLElement>('[data-key="i0"]')!;
    expect(again).not.toBe(first);
    expect(created.filter((key) => key === 'i0').length).toBe(buildsBefore + 1);
    expect(again.querySelector<HTMLElement>(`.${THUMBNAIL_GRID_THUMB_CLASS}`)!.dataset['thumbnailUrl']).toBe('blob:i0');
  });

  it('keeps tiles that stay in view and only draws when new ones were built', () => {
    const { grid, win, scrollTo, draws } = fixtureCreate(4);
    win.itemsSet(itemsOf(100));
    const kept = grid.querySelector('[data-key="i8"]');
    const drawn = draws();
    scrollTo(5); // same rows in view
    expect(draws()).toBe(drawn);
    scrollTo(108 * 2); // one more row at the bottom
    expect(grid.querySelector('[data-key="i8"]')).toBe(kept);
    expect(draws()).toBeGreaterThan(drawn);
  });

  it('builds every tile again when the items change, even with the same keys (renames)', () => {
    const { grid, win } = fixtureCreate(4);
    win.itemsSet(itemsOf(30));
    const old = grid.querySelector('[data-key="i2"]')!;
    expect(old.textContent).toBe('i2');
    win.itemsSet(itemsOf(30).map((item) => ({ ...item, label: `renamed ${item.key}` })));
    const fresh = grid.querySelector('[data-key="i2"]')!;
    expect(fresh).not.toBe(old);
    expect(fresh.textContent).toBe('renamed i2');
    expect(old.isConnected).toBe(false);
  });

  it('follows items added, removed and re-sorted, keeping order and spacers right', () => {
    const { grid, win, scrollTo } = fixtureCreate(4);
    win.itemsSet(itemsOf(100));
    scrollTo(10 + 108 * 10);
    win.itemsSet([...itemsOf(100)].reverse());
    // The grid still shows the same offset; rows 9-13 hold the reversed items.
    expect(builtKeys(grid)[0]).toBe('i63');
    expect(builtKeys(grid).slice(0, 4)).toEqual(['i63', 'i62', 'i61', 'i60']);
    win.itemsSet(itemsOf(8));
    expect(builtKeys(grid)).toEqual(itemsOf(8).map((item) => item.key));
    expect(spacers(grid)).toEqual({ top: 0, bottom: 0 });
    win.itemsSet([]);
    expect(builtKeys(grid)).toEqual([]);
    expect(grid.children.length).toBe(0);
  });

  it('lays rows out again when the columns change', () => {
    const { grid, win, columnsSet } = fixtureCreate(4);
    win.itemsSet(itemsOf(100));
    expect(builtKeys(grid)).toHaveLength(16);
    columnsSet(2);
    expect(builtKeys(grid)).toHaveLength(8);
    expect(builtKeys(grid).at(-1)).toBe('i7');
    columnsSet(6);
    expect(builtKeys(grid)).toHaveLength(24);
  });

  it('builds a bounded first batch without spacers while the grid has no size', () => {
    const { grid, win, columnsSet } = fixtureCreate(0);
    win.itemsSet(itemsOf(500));
    expect(builtKeys(grid)).toHaveLength(96);
    expect(spacers(grid)).toEqual({ top: 0, bottom: 0 });
    win.itemsSet(itemsOf(5));
    expect(builtKeys(grid)).toHaveLength(5);
    win.itemsSet(itemsOf(500));
    columnsSet(4);
    expect(builtKeys(grid)).toHaveLength(16);
    expect(spacers(grid).bottom).toBeGreaterThan(0);
  });

  it('finds tiles and rows by key', () => {
    const { win } = fixtureCreate(4);
    win.itemsSet(itemsOf(100));
    expect(win.indexOfKey('i42')).toBe(42);
    expect(win.indexOfKey('nope')).toBe(-1);
    expect(win.tileOfKey('i1')?.dataset['key']).toBe('i1');
    expect(win.tileOfKey('i42')).toBeNull();
    expect(win.itemTopPx(42)).toBe(10 + 10 * (TILE_PX + GAP_PX));
  });

  it('keeps the tile in view where it was when items are added above it', () => {
    const { grid, win, scrollTo } = fixtureCreate(4);
    win.itemsSet(itemsOf(100));
    scrollTo(10 + 108 * 10 + 30);
    const anchors = win.anchorsTake();
    expect(anchors[0]).toEqual({ key: 'i40', offset: -30 });
    win.itemsSet([...Array.from({ length: 12 }, (_, index) => ({ key: `new${index}` })), ...itemsOf(100)]);
    win.anchorsRestore(anchors);
    // 12 new items are 3 rows (3 × 108 px) above.
    expect(grid.scrollTop).toBe(10 + 108 * 13 + 30);
    expect(builtKeys(grid)).toContain('i40');
    // When the anchor itself is gone the next one still listed holds the place.
    const next = win.anchorsTake();
    win.itemsSet(itemsOf(100).filter((item) => item.key !== next[0]!.key));
    win.anchorsRestore(next);
    expect(next[1]!.key).toBe('i41');
    expect(grid.scrollTop).toBe(win.itemTopPx(win.indexOfKey('i41'))! - next[1]!.offset);
  });

  it('keeps Tab walking through all tiles: the next one is built and focused at the edge', () => {
    const { grid, win } = fixtureCreate(4);
    win.itemsSet(itemsOf(100));
    const last = grid.querySelector<HTMLElement>('[data-key="i15"]')!;
    last.focus();
    expect(document.activeElement).toBe(last);
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    last.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect((document.activeElement as HTMLElement).dataset['key']).toBe('i16');
    // Inside the built tiles Tab is left to the browser.
    const inside = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    grid.querySelector<HTMLElement>('[data-key="i17"]')!.dispatchEvent(inside);
    expect(inside.defaultPrevented).toBe(false);
    // Shift+Tab from the first built tile walks back.
    const firstKey = builtKeys(grid)[0]!;
    const index = win.indexOfKey(firstKey);
    grid.querySelector<HTMLElement>(`[data-key="${firstKey}"]`)!.focus();
    const back = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    document.activeElement!.dispatchEvent(back);
    expect(back.defaultPrevented).toBe(index > 0);
  });

  it('stops following the grid and drops its tiles when disposed', () => {
    const { grid, win, scrollTo } = fixtureCreate(4);
    win.itemsSet(itemsOf(100));
    const tile = grid.querySelector<HTMLElement>('[data-key="i0"]')!;
    win.dispose();
    expect(grid.children.length).toBe(0);
    expect(tile.isConnected).toBe(false);
    scrollTo(500);
    expect(grid.children.length).toBe(0);
  });
});

describe('thumbnailGridTileRelease', () => {
  it('frees every thumbnail of a tile, or a thumbnail itself', () => {
    const tile = document.createElement('div');
    const thumb = thumbnailGridThumbCreate('x', 'blob:a', 'cover', new Blob(['x']));
    thumb.dataset['thumbnailDrawn'] = 'k';
    const canvas = document.createElement('canvas');
    canvas.width = 50;
    canvas.height = 50;
    thumb.appendChild(canvas);
    tile.appendChild(thumb);
    thumbnailGridTileRelease(tile);
    expect(thumb.dataset['thumbnailUrl']).toBeUndefined();
    expect(thumb.dataset['thumbnailDrawn']).toBeUndefined();
    expect(thumb.children.length).toBe(0);
    expect(canvas.width).toBe(0);
    const again = thumbnailGridThumbCreate('x', 'blob:b', 'cover');
    thumbnailGridTileRelease(again);
    expect(again.dataset['thumbnailUrl']).toBeUndefined();
  });
});
