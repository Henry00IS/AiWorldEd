import { describe, expect, it } from 'vitest';
import {
  PAINT_EXPORT_CROP_MAX_PATCHES,
  type PaintExportCropMask,
  type PaintExportCropRect,
  paintExportCropRects,
  paintExportCropSplit,
} from '@/paint/export/paint_export_crop.js';

/**
 * Builds a painted-texel mask with square spots.
 *
 * @param width Width in texels.
 * @param height Height in texels.
 * @param spots Spots as [s, t, size] from the mask origin.
 * @returns Mask whose origin is at (-100, 50) in canvas texels.
 */
function mask(width: number, height: number, spots: readonly [number, number, number][]): PaintExportCropMask {
  const painted = new Uint8Array(width * height);
  for (const [s, t, size] of spots) {
    for (let y = t; y < t + size; y++) for (let x = s; x < s + size; x++) painted[y * width + x] = 1;
  }
  return { minS: -100, minT: 50, width, height, painted };
}

/**
 * Returns the signed area of a polygon.
 *
 * @param points Points as [s, t].
 * @returns Area.
 */
function area(points: readonly (readonly [number, number])[]): number {
  let sum = 0;
  for (let index = 0; index < points.length; index++) {
    const [s0, t0] = points[index]!;
    const [s1, t1] = points[(index + 1) % points.length]!;
    sum += s0 * t1 - s1 * t0;
  }
  return sum / 2;
}

describe('Export crop', () => {
  it('finds nothing to cut on an empty face', () => {
    expect(paintExportCropRects(mask(64, 64, []))).toEqual([]);
  });

  it('gives two screws far apart on one floor two tight patches', () => {
    const rects = paintExportCropRects(
      mask(400, 100, [
        [10, 20, 12],
        [360, 60, 12],
      ]),
    );
    expect(rects).toHaveLength(2);
    const sorted = [...rects].sort((left, right) => left.minS - right.minS);
    expect(sorted[0]).toEqual({ minS: -90, minT: 70, maxS: -78, maxT: 82 });
    expect(sorted[1]).toEqual({ minS: 260, minT: 110, maxS: 272, maxT: 122 });
  });

  it('merges spots whose shared patch costs less than two', () => {
    const rects = paintExportCropRects(
      mask(200, 100, [
        [10, 20, 12],
        [34, 24, 12],
      ]),
    );
    expect(rects).toEqual([{ minS: -90, minT: 70, maxS: -54, maxT: 86 }]);
  });

  it('falls back to one bounding patch for many scattered specks', () => {
    const spots: [number, number, number][] = [];
    for (let index = 0; index < PAINT_EXPORT_CROP_MAX_PATCHES + 4; index++) {
      spots.push([(index % 6) * 100 + 3, Math.floor(index / 6) * 100 + 3, 20]);
    }
    const rects = paintExportCropRects(mask(600, 300, spots));
    expect(rects).toHaveLength(1);
    expect(rects[0]).toEqual({ minS: -97, minT: 53, maxS: 423, maxT: 173 });
  });

  it('never returns overlapping patches', () => {
    const rects = paintExportCropRects(
      mask(300, 300, [
        [0, 0, 40],
        [60, 60, 40],
        [0, 120, 4],
        [200, 200, 30],
      ]),
    );
    for (let left = 0; left < rects.length; left++) {
      for (let right = left + 1; right < rects.length; right++) {
        const a = rects[left]!;
        const b = rects[right]!;
        expect(a.maxS <= b.minS || b.maxS <= a.minS || a.maxT <= b.minT || b.maxT <= a.minT).toBe(true);
      }
    }
  });

  it('splits a triangle into pieces inside each patch and the rest, keeping its area', () => {
    const triangle: [number, number][] = [
      [0, 0],
      [100, 0],
      [0, 80],
    ];
    const rects: PaintExportCropRect[] = [
      { minS: 10, minT: 10, maxS: 30, maxT: 30 },
      { minS: 50, minT: -20, maxS: 70, maxT: 5 },
      { minS: 300, minT: 300, maxS: 310, maxT: 310 },
    ];
    const pieces = paintExportCropSplit(triangle, rects);
    const total = pieces.reduce((sum, piece) => sum + Math.abs(area(piece.points)), 0);
    expect(total).toBeCloseTo(Math.abs(area(triangle)), 6);
    expect(pieces.filter((piece) => piece.patch === 0).reduce((sum, piece) => sum + area(piece.points), 0)).toBeCloseTo(
      400,
      6,
    );
    expect(pieces.filter((piece) => piece.patch === 1).reduce((sum, piece) => sum + area(piece.points), 0)).toBeCloseTo(
      100,
      6,
    );
    expect(pieces.some((piece) => piece.patch === 2)).toBe(false);
    for (const piece of pieces) {
      expect(piece.points.length).toBe(3);
      expect(area(piece.points)).toBeGreaterThan(0);
      const rect = piece.patch === null ? null : rects[piece.patch]!;
      const centroid = piece.points.reduce(([s, t], [ps, pt]) => [s + ps / 3, t + pt / 3], [0, 0]);
      const inside = (entry: PaintExportCropRect) =>
        centroid[0] > entry.minS && centroid[0] < entry.maxS && centroid[1] > entry.minT && centroid[1] < entry.maxT;
      if (rect === null) expect(rects.some(inside)).toBe(false);
      else expect(inside(rect)).toBe(true);
      // Barycentric weights reproduce every corner.
      piece.weights.forEach((weight, corner) => {
        const s = weight[0] * triangle[0]![0] + weight[1] * triangle[1]![0] + weight[2] * triangle[2]![0];
        const t = weight[0] * triangle[0]![1] + weight[1] * triangle[1]![1] + weight[2] * triangle[2]![1];
        expect(s).toBeCloseTo(piece.points[corner]![0], 6);
        expect(t).toBeCloseTo(piece.points[corner]![1], 6);
      });
    }
  });

  it('keeps a triangle whole when no patch reaches it', () => {
    const pieces = paintExportCropSplit(
      [
        [0, 0],
        [10, 0],
        [0, 10],
      ],
      [{ minS: 20, minT: 20, maxS: 30, maxT: 30 }],
    );
    expect(pieces).toHaveLength(1);
    expect(pieces[0]?.patch).toBeNull();
    expect(pieces[0]?.weights).toEqual([
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]);
  });
});
