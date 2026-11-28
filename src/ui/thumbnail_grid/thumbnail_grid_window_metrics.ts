/** One row of a thumbnail grid: a run of tiles, or one full-width item. */
export interface ThumbnailGridRow {
  /** Index of the first item in the row. */
  first: number;
  /** Index after the last item in the row. */
  end: number;
  /** Row height in CSS pixels. */
  heightPx: number;
  /** Distance from the top of the first row to the top of this one. */
  topPx: number;
}

/** What {@link thumbnailGridRowsBuild} needs to know about the items. */
export interface ThumbnailGridRowsSource {
  /** Number of items. */
  count: number;
  /** Columns of the grid (at least 1). */
  columns: number;
  /** Gap between rows in CSS pixels. */
  gapPx: number;
  /** Tells whether an item spans the whole row (a heading), not one column. */
  isFull: (index: number) => boolean;
  /** Height of a row of tiles. */
  tileHeightPx: number;
  /** Height of a full-width item. */
  fullHeightPx: (index: number) => number;
}

/**
 * Lays items out in rows the way the browser's grid does: tiles fill a row left
 * to right, a full-width item takes a row of its own (and ends the row before
 * it).
 *
 * @param source Items and sizes.
 * @returns Rows from the top, with their offsets.
 */
export function thumbnailGridRowsBuild(source: ThumbnailGridRowsSource): ThumbnailGridRow[] {
  const columns = Math.max(1, Math.floor(source.columns));
  const rows: ThumbnailGridRow[] = [];
  let top = 0;
  const push = (first: number, end: number, heightPx: number): void => {
    rows.push({ first, end, heightPx, topPx: top });
    top += heightPx + source.gapPx;
  };
  let runStart = -1;
  for (let index = 0; index < source.count; index++) {
    if (source.isFull(index)) {
      if (runStart >= 0) push(runStart, index, source.tileHeightPx);
      runStart = -1;
      push(index, index + 1, source.fullHeightPx(index));
      continue;
    }
    if (runStart < 0) runStart = index;
    if (index + 1 - runStart === columns) {
      push(runStart, index + 1, source.tileHeightPx);
      runStart = -1;
    }
  }
  if (runStart >= 0) push(runStart, source.count, source.tileHeightPx);
  return rows;
}

/**
 * Finds the rows in a vertical range, by binary search.
 *
 * @param rows Rows from the top.
 * @param fromPx Top of the range, from the top of the first row.
 * @param toPx Bottom of the range.
 * @returns Indices of the first and last row that intersect the range (the
 *   nearest row when the range lies outside the rows), or null without rows.
 */
export function thumbnailGridRowsIntersect(
  rows: readonly ThumbnailGridRow[],
  fromPx: number,
  toPx: number,
): { first: number; last: number } | null {
  if (rows.length === 0) return null;
  const find = (px: number, bottom: boolean): number => {
    let low = 0;
    let high = rows.length - 1;
    while (low < high) {
      const middle = (low + high + (bottom ? 1 : 0)) >> 1;
      const row = rows[middle]!;
      if (bottom ? row.topPx <= px : row.topPx + row.heightPx <= px) {
        if (bottom) low = middle;
        else low = middle + 1;
      } else if (bottom) high = middle - 1;
      else high = middle;
    }
    return low;
  };
  return { first: find(fromPx, false), last: Math.max(find(fromPx, false), find(toPx, true)) };
}

/**
 * Returns the rows to build for a viewport: the visible ones and a few more on
 * either side, so scrolling reveals tiles that already exist.
 *
 * @param rows Rows from the top.
 * @param scrollPx Scroll offset minus the grid's top padding.
 * @param viewportPx Viewport height.
 * @param overscanRows Extra rows above and below.
 * @returns Indices of the first and last row to build, or null without rows.
 */
export function thumbnailGridRowsWindow(
  rows: readonly ThumbnailGridRow[],
  scrollPx: number,
  viewportPx: number,
  overscanRows: number,
): { first: number; last: number } | null {
  const visible = thumbnailGridRowsIntersect(rows, scrollPx, scrollPx + viewportPx);
  if (visible === null) return null;
  const overscan = Math.max(0, Math.floor(overscanRows));
  return { first: Math.max(0, visible.first - overscan), last: Math.min(rows.length - 1, visible.last + overscan) };
}
