import { describe, expect, it } from 'vitest';
import {
  thumbnailGridRowsBuild,
  thumbnailGridRowsIntersect,
  thumbnailGridRowsWindow,
} from '@/ui/thumbnail_grid/thumbnail_grid_window_metrics.js';

/**
 * Builds rows for tiles of 100 px with an 8 px gap.
 *
 * @param count Items.
 * @param columns Columns.
 * @param full Indices of full-width items (30 px high).
 * @returns Rows.
 */
function rowsOf(count: number, columns: number, full: readonly number[] = []) {
  return thumbnailGridRowsBuild({
    count,
    columns,
    gapPx: 8,
    isFull: (index) => full.includes(index),
    tileHeightPx: 100,
    fullHeightPx: () => 30,
  });
}

describe('thumbnailGridRowsBuild', () => {
  it('fills rows left to right, the last one partly', () => {
    const rows = rowsOf(10, 4);
    expect(rows.map((row) => [row.first, row.end])).toEqual([
      [0, 4],
      [4, 8],
      [8, 10],
    ]);
    expect(rows.map((row) => row.topPx)).toEqual([0, 108, 216]);
  });

  it('gives a full-width item its own row and ends the row before it', () => {
    const rows = rowsOf(8, 4, [2]);
    expect(rows.map((row) => [row.first, row.end, row.heightPx])).toEqual([
      [0, 2, 100],
      [2, 3, 30],
      [3, 7, 100],
      [7, 8, 100],
    ]);
    expect(rows[2]!.topPx).toBe(100 + 8 + 30 + 8);
    expect(rows[3]!.topPx).toBe(100 + 8 + 30 + 8 + 100 + 8);
  });

  it('has no rows without items and never fewer than one column', () => {
    expect(rowsOf(0, 4)).toEqual([]);
    expect(rowsOf(3, 0).map((row) => row.end - row.first)).toEqual([1, 1, 1]);
  });
});

describe('thumbnailGridRowsIntersect and thumbnailGridRowsWindow', () => {
  const rows = rowsOf(40, 4); // 10 rows, 108 px apart

  it('finds the rows a vertical range touches', () => {
    expect(thumbnailGridRowsIntersect(rows, 0, 300)).toEqual({ first: 0, last: 2 });
    expect(thumbnailGridRowsIntersect(rows, 216, 300)).toEqual({ first: 2, last: 2 });
    // The gap below a row belongs to no row: row 1 ends at 208.
    expect(thumbnailGridRowsIntersect(rows, 205, 250)).toEqual({ first: 1, last: 2 });
    expect(thumbnailGridRowsIntersect(rows, 5000, 5300)).toEqual({ first: 9, last: 9 });
    expect(thumbnailGridRowsIntersect([], 0, 100)).toBeNull();
  });

  it('adds overscan rows on both sides, within the list', () => {
    expect(thumbnailGridRowsWindow(rows, 0, 300, 2)).toEqual({ first: 0, last: 4 });
    expect(thumbnailGridRowsWindow(rows, 432, 300, 2)).toEqual({ first: 2, last: 8 });
    expect(thumbnailGridRowsWindow(rows, 5000, 300, 2)).toEqual({ first: 7, last: 9 });
    expect(thumbnailGridRowsWindow(rows, 0, 300, 0)).toEqual({ first: 0, last: 2 });
  });
});
