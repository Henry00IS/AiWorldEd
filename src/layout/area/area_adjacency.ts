import { areaNumbersNearlyEqual, areaRectBottom, areaRectRight, type AreaRect } from './area_rect.js';
import type { AreaLeafPlacement } from './area_leaf_placement.js';
import type { AreaSplitDirection } from './area_split_direction.js';

/** Shared border between two adjacent leaf areas. */
export interface AreaSharedBorder {
  firstAreaId: string;
  secondAreaId: string;
  /** Axis of the border: horizontal means a vertical divider (left|right). */
  direction: AreaSplitDirection;
  /** Normalized border segment as a thin rect for hit testing. */
  borderRect: AreaRect;
}

/**
 * Lists every pair of leaves that share a positive-length edge segment for
 * resize hit targets.
 *
 * @param placements Current leaf placements.
 * @returns Shared borders (each pair once).
 */
export function listSharedBorders(placements: readonly AreaLeafPlacement[]): AreaSharedBorder[] {
  const borders: AreaSharedBorder[] = [];
  for (let i = 0; i < placements.length; i += 1) {
    for (let j = i + 1; j < placements.length; j += 1) {
      const border = borderBetween(placements[i]!, placements[j]!);
      if (border) borders.push(border);
    }
  }
  return borders;
}

/**
 * Builds a shared border record when two placements share a positive-length
 * edge segment.
 *
 * @param first First placement.
 * @param second Second placement.
 * @returns Border or null.
 */
function borderBetween(first: AreaLeafPlacement, second: AreaLeafPlacement): AreaSharedBorder | null {
  const vertical = verticalBorderBetween(first, second);
  if (vertical) return vertical;
  return horizontalBorderBetween(first, second);
}

/**
 * Builds a left/right shared border when the placements share a vertical edge
 * segment.
 *
 * @param first First placement.
 * @param second Second placement.
 * @returns Horizontal-split border or null.
 */
function verticalBorderBetween(first: AreaLeafPlacement, second: AreaLeafPlacement): AreaSharedBorder | null {
  if (!shareVerticalEdgeSegment(first.rect, second.rect)) return null;
  const left = areaRectRight(first.rect) <= second.rect.x + 1e-9 ? first : second;
  const right = left === first ? second : first;
  return {
    firstAreaId: left.payload.areaId,
    secondAreaId: right.payload.areaId,
    direction: 'horizontal',
    borderRect: {
      x: areaRectRight(left.rect) - 0.001,
      y: Math.max(left.rect.y, right.rect.y),
      width: 0.002,
      height: Math.min(areaRectBottom(left.rect), areaRectBottom(right.rect)) - Math.max(left.rect.y, right.rect.y),
    },
  };
}

/**
 * Builds a top/bottom shared border when the placements share a horizontal edge
 * segment.
 *
 * @param first First placement.
 * @param second Second placement.
 * @returns Vertical-split border or null.
 */
function horizontalBorderBetween(first: AreaLeafPlacement, second: AreaLeafPlacement): AreaSharedBorder | null {
  if (!shareHorizontalEdgeSegment(first.rect, second.rect)) return null;
  const top = areaRectBottom(first.rect) <= second.rect.y + 1e-9 ? first : second;
  const bottom = top === first ? second : first;
  return {
    firstAreaId: top.payload.areaId,
    secondAreaId: bottom.payload.areaId,
    direction: 'vertical',
    borderRect: {
      x: Math.max(top.rect.x, bottom.rect.x),
      y: areaRectBottom(top.rect) - 0.001,
      width: Math.min(areaRectRight(top.rect), areaRectRight(bottom.rect)) - Math.max(top.rect.x, bottom.rect.x),
      height: 0.002,
    },
  };
}

/**
 * Returns whether rects share a positive-length vertical edge segment.
 *
 * @param a First rect.
 * @param b Second rect.
 * @returns True when aligned as left/right neighbors.
 */
function shareVerticalEdgeSegment(a: AreaRect, b: AreaRect): boolean {
  const touching = areaNumbersNearlyEqual(areaRectRight(a), b.x) || areaNumbersNearlyEqual(areaRectRight(b), a.x);
  return touching && Math.min(areaRectBottom(a), areaRectBottom(b)) - Math.max(a.y, b.y) > 1e-9;
}

/**
 * Returns whether rects share a positive-length horizontal edge segment.
 *
 * @param a First rect.
 * @param b Second rect.
 * @returns True when aligned as top/bottom neighbors.
 */
function shareHorizontalEdgeSegment(a: AreaRect, b: AreaRect): boolean {
  const touching = areaNumbersNearlyEqual(areaRectBottom(a), b.y) || areaNumbersNearlyEqual(areaRectBottom(b), a.y);
  return touching && Math.min(areaRectRight(a), areaRectRight(b)) - Math.max(a.x, b.x) > 1e-9;
}
