/**
 * Export crop: finds the painted parts of a face as a few rectangles in canvas
 * texels, and splits the face's triangles along them, so the export image only
 * holds painted patches and the rest of the face keeps its original material.
 */

/** Painted texels of a face's canvas rectangle. */
export interface PaintExportCropMask {
  /** Canvas texel of the mask's first column and row. */
  readonly minS: number;
  readonly minT: number;
  readonly width: number;
  readonly height: number;
  /** One byte per texel, row by row; nonzero is painted. */
  readonly painted: Uint8Array;
}

/** A patch rectangle in canvas texels: min inclusive, max exclusive. */
export interface PaintExportCropRect {
  readonly minS: number;
  readonly minT: number;
  readonly maxS: number;
  readonly maxT: number;
}

/** A triangle of a split face triangle. */
export interface PaintExportCropPiece {
  /** Corners in canvas texels. */
  readonly points: [number, number][];
  /** Barycentric weights of each corner on the original triangle. */
  readonly weights: [number, number, number][];
  /** Index of the patch it lies in, or null outside every patch. */
  readonly patch: number | null;
}

/** Most patches one face is cut into; more fall back to one bounding patch. */
export const PAINT_EXPORT_CROP_MAX_PATCHES = 8;
/** Texels per clustering cell; paint closer than one cell joins a cluster. */
export const PAINT_EXPORT_CROP_CELL = 4;
/** Texels of image margin every patch carries for filtering. */
export const PAINT_EXPORT_CROP_MARGIN = 2;
/**
 * Fixed cost of one more patch, in image texels: the cut geometry and the
 * packing slack it brings.
 */
export const PAINT_EXPORT_CROP_PATCH_COST = 32 * 32;

/**
 * Finds the patches that cover a face's paint: clusters of nearby painted
 * texels, merged while one patch costs less than two, and a single bounding
 * patch when too many remain.
 *
 * @param mask Painted texels.
 * @returns Disjoint patches, possibly empty.
 */
export function paintExportCropRects(mask: PaintExportCropMask): PaintExportCropRect[] {
  let rects = paintExportCropClusters(mask);
  if (rects.length === 0) return [];
  rects = paintExportCropMerge(rects);
  if (rects.length > PAINT_EXPORT_CROP_MAX_PATCHES) rects = [rects.reduce(paintExportCropUnion)];
  return rects;
}

/**
 * Returns the image cost of a patch.
 *
 * @param rect Patch.
 * @returns Cost in texels.
 */
export function paintExportCropCost(rect: PaintExportCropRect): number {
  const margin = 2 * PAINT_EXPORT_CROP_MARGIN;
  return (rect.maxS - rect.minS + margin) * (rect.maxT - rect.minT + margin) + PAINT_EXPORT_CROP_PATCH_COST;
}

/**
 * Returns the rectangle around two rectangles.
 *
 * @param left Rectangle.
 * @param right Rectangle.
 * @returns Union bounds.
 */
function paintExportCropUnion(left: PaintExportCropRect, right: PaintExportCropRect): PaintExportCropRect {
  return {
    minS: Math.min(left.minS, right.minS),
    minT: Math.min(left.minT, right.minT),
    maxS: Math.max(left.maxS, right.maxS),
    maxT: Math.max(left.maxT, right.maxT),
  };
}

/**
 * Tells whether two rectangles overlap.
 *
 * @param left Rectangle.
 * @param right Rectangle.
 * @returns True when they share area.
 */
function paintExportCropOverlap(left: PaintExportCropRect, right: PaintExportCropRect): boolean {
  return left.minS < right.maxS && right.minS < left.maxS && left.minT < right.maxT && right.minT < left.maxT;
}

/**
 * Groups painted texels into clusters on a coarse cell grid, where cells that
 * touch, diagonals included, belong together, and returns each cluster's tight
 * texel bounds.
 *
 * @param mask Painted texels.
 * @returns One rectangle per cluster.
 */
function paintExportCropClusters(mask: PaintExportCropMask): PaintExportCropRect[] {
  const cell = PAINT_EXPORT_CROP_CELL;
  const columns = Math.ceil(mask.width / cell);
  const rows = Math.ceil(mask.height / cell);
  // Tight painted bounds per cell, in mask texels; empty cells keep minX > maxX.
  const minX = new Int32Array(columns * rows).fill(0x3fffffff);
  const minY = new Int32Array(columns * rows).fill(0x3fffffff);
  const maxX = new Int32Array(columns * rows).fill(-1);
  const maxY = new Int32Array(columns * rows).fill(-1);
  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      if (mask.painted[y * mask.width + x] === 0) continue;
      const index = Math.floor(y / cell) * columns + Math.floor(x / cell);
      minX[index] = Math.min(minX[index]!, x);
      minY[index] = Math.min(minY[index]!, y);
      maxX[index] = Math.max(maxX[index]!, x);
      maxY[index] = Math.max(maxY[index]!, y);
    }
  }
  const visited = new Uint8Array(columns * rows);
  const rects: PaintExportCropRect[] = [];
  const stack: number[] = [];
  for (let start = 0; start < columns * rows; start++) {
    if (visited[start] === 1 || maxX[start]! < 0) continue;
    visited[start] = 1;
    stack.push(start);
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    while (stack.length > 0) {
      const index = stack.pop()!;
      left = Math.min(left, minX[index]!);
      top = Math.min(top, minY[index]!);
      right = Math.max(right, maxX[index]!);
      bottom = Math.max(bottom, maxY[index]!);
      const column = index % columns;
      const row = Math.floor(index / columns);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = column + dx;
          const y = row + dy;
          if (x < 0 || y < 0 || x >= columns || y >= rows) continue;
          const next = y * columns + x;
          if (visited[next] === 1 || maxX[next]! < 0) continue;
          visited[next] = 1;
          stack.push(next);
        }
      }
    }
    rects.push({
      minS: mask.minS + left,
      minT: mask.minT + top,
      maxS: mask.minS + right + 1,
      maxT: mask.minT + bottom + 1,
    });
  }
  return rects;
}

/**
 * Merges patches while one patch around two costs no more than both, and always
 * when they overlap, cheapest saving first.
 *
 * @param input Patches.
 * @returns Disjoint patches.
 */
function paintExportCropMerge(input: readonly PaintExportCropRect[]): PaintExportCropRect[] {
  const rects = [...input];
  for (;;) {
    let best: { left: number; right: number; saving: number } | null = null;
    for (let left = 0; left < rects.length; left++) {
      for (let right = left + 1; right < rects.length; right++) {
        const a = rects[left]!;
        const b = rects[right]!;
        const union = paintExportCropUnion(a, b);
        const saving = paintExportCropCost(a) + paintExportCropCost(b) - paintExportCropCost(union);
        const forced = paintExportCropOverlap(a, b);
        if (!forced && saving < 0) continue;
        const score = forced ? Infinity : saving;
        if (best === null || score > best.saving) best = { left, right, saving: score };
      }
    }
    if (best === null) return rects;
    const merged = paintExportCropUnion(rects[best.left]!, rects[best.right]!);
    rects.splice(best.right, 1);
    rects[best.left] = merged;
  }
}

/** A polygon corner during clipping. */
interface PaintExportCropCorner {
  readonly s: number;
  readonly t: number;
  readonly weight: [number, number, number];
}

/**
 * Splits a triangle along patches: the parts inside each patch and the rest, as
 * triangles with barycentric weights on the original, so every vertex attribute
 * can be interpolated exactly.
 *
 * @param triangle Corners in canvas texels.
 * @param rects Disjoint patches.
 * @returns Pieces with positive area, in the triangle's winding.
 */
export function paintExportCropSplit(
  triangle: readonly (readonly [number, number])[],
  rects: readonly PaintExportCropRect[],
): PaintExportCropPiece[] {
  const corners: PaintExportCropCorner[] = triangle.map(([s, t], index) => ({
    s,
    t,
    weight: [index === 0 ? 1 : 0, index === 1 ? 1 : 0, index === 2 ? 1 : 0],
  }));
  let rest: PaintExportCropCorner[][] = [corners];
  const pieces: PaintExportCropPiece[] = [];
  rects.forEach((rect, patch) => {
    const next: PaintExportCropCorner[][] = [];
    for (const polygon of rest) {
      if (!paintExportCropTouches(polygon, rect)) {
        next.push(polygon);
        continue;
      }
      let inside = polygon;
      const edges: [axis: 's' | 't', value: number, keepAbove: boolean][] = [
        ['s', rect.minS, true],
        ['s', rect.maxS, false],
        ['t', rect.minT, true],
        ['t', rect.maxT, false],
      ];
      for (const [axis, value, keepAbove] of edges) {
        const outside = paintExportCropClip(inside, axis, value, !keepAbove);
        if (paintExportCropArea(outside) > 1e-9) next.push(outside);
        inside = paintExportCropClip(inside, axis, value, keepAbove);
        if (inside.length < 3) break;
      }
      if (paintExportCropArea(inside) > 1e-9) pieces.push(...paintExportCropFan(inside, patch));
    }
    rest = next;
  });
  for (const polygon of rest) pieces.push(...paintExportCropFan(polygon, null));
  return pieces;
}

/**
 * Tells whether a polygon's bounds reach into a rectangle.
 *
 * @param polygon Polygon.
 * @param rect Rectangle.
 * @returns True when they may overlap.
 */
function paintExportCropTouches(polygon: readonly PaintExportCropCorner[], rect: PaintExportCropRect): boolean {
  let minS = Infinity;
  let minT = Infinity;
  let maxS = -Infinity;
  let maxT = -Infinity;
  for (const corner of polygon) {
    minS = Math.min(minS, corner.s);
    minT = Math.min(minT, corner.t);
    maxS = Math.max(maxS, corner.s);
    maxT = Math.max(maxT, corner.t);
  }
  return minS < rect.maxS && rect.minS < maxS && minT < rect.maxT && rect.minT < maxT;
}

/**
 * Clips a convex polygon to one side of an axis line.
 *
 * @param polygon Polygon.
 * @param axis Axis the line is constant on.
 * @param value Line position.
 * @param keepAbove True keeps values at or above the line, false at or below.
 * @returns Clipped polygon.
 */
function paintExportCropClip(
  polygon: readonly PaintExportCropCorner[],
  axis: 's' | 't',
  value: number,
  keepAbove: boolean,
): PaintExportCropCorner[] {
  const output: PaintExportCropCorner[] = [];
  const side = (corner: PaintExportCropCorner) => (keepAbove ? corner[axis] - value : value - corner[axis]);
  for (let index = 0; index < polygon.length; index++) {
    const current = polygon[index]!;
    const next = polygon[(index + 1) % polygon.length]!;
    const a = side(current);
    const b = side(next);
    if (a >= 0) output.push(current);
    if (a >= 0 !== b >= 0) {
      const f = a / (a - b);
      output.push({
        s: current.s + (next.s - current.s) * f,
        t: current.t + (next.t - current.t) * f,
        weight: [0, 1, 2].map((k) => current.weight[k]! + (next.weight[k]! - current.weight[k]!) * f) as [
          number,
          number,
          number,
        ],
      });
    }
  }
  return output;
}

/**
 * Returns the absolute area of a polygon.
 *
 * @param polygon Polygon.
 * @returns Area.
 */
function paintExportCropArea(polygon: readonly PaintExportCropCorner[]): number {
  let sum = 0;
  for (let index = 0; index < polygon.length; index++) {
    const a = polygon[index]!;
    const b = polygon[(index + 1) % polygon.length]!;
    sum += a.s * b.t - b.s * a.t;
  }
  return Math.abs(sum / 2);
}

/**
 * Triangulates a convex polygon as a fan, dropping slivers.
 *
 * @param polygon Polygon.
 * @param patch Patch index, or null.
 * @returns Triangles.
 */
function paintExportCropFan(polygon: readonly PaintExportCropCorner[], patch: number | null): PaintExportCropPiece[] {
  const pieces: PaintExportCropPiece[] = [];
  const first = polygon[0];
  if (first === undefined) return pieces;
  for (let index = 1; index + 1 < polygon.length; index++) {
    const triangle = [first, polygon[index]!, polygon[index + 1]!];
    if (paintExportCropArea(triangle) <= 1e-9) continue;
    pieces.push({
      points: triangle.map((corner) => [corner.s, corner.t]),
      weights: triangle.map((corner) => [...corner.weight]),
      patch,
    });
  }
  return pieces;
}
