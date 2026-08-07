import type { AreaRect } from './area_rect.js';

/** Named corner of a rectangular area. */
export type AreaCornerName = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/** CSS left/top strings for a corner grip inside a pane. */
export interface AreaCornerGripStyle {
  left: string;
  top: string;
}

/**
 * Builds CSS left and top calc strings that place a corner grip fully inside a
 * pane rect. Insets left and top placements by half of gapPx; insets right and
 * bottom placements by half of gapPx plus gripSizePx so the grip box stays
 * inside the rect.
 *
 * @param rect Normalized pane rect in [0, 1] with x, y, width, and height.
 * @param corner Named corner of the pane where the grip is placed.
 * @param gapPx Full separator gap in CSS pixels; half is applied as inset per
 *   side.
 * @param gripSizePx Grip hit box size in CSS pixels, subtracted on right and
 *   bottom placements.
 * @returns Object whose left and top are CSS calc strings for the grip
 *   position.
 */
export function computeAreaCornerGripStyle(
  rect: AreaRect,
  corner: AreaCornerName,
  gapPx: number,
  gripSizePx: number,
): AreaCornerGripStyle {
  const halfGap = gapPx / 2;
  const isLeft = corner.includes('left');
  const isTop = corner.includes('top');
  const left = isLeft
    ? `calc(${rect.x * 100}% + ${halfGap}px)`
    : `calc(${(rect.x + rect.width) * 100}% - ${halfGap + gripSizePx}px)`;
  const top = isTop
    ? `calc(${rect.y * 100}% + ${halfGap}px)`
    : `calc(${(rect.y + rect.height) * 100}% - ${halfGap + gripSizePx}px)`;
  return { left, top };
}
