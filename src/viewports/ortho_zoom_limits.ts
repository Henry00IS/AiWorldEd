/**
 * Safe orthographic frustum half-height bounds for 2D viewports.
 * Keeps wheel zoom away from float-precision collapse (too far out)
 * and useless microscopic scales (too far in).
 */
export const MIN_ORTHO_HALF_EXTENT = 0.01;

/**
 * Maximum orthographic half-height (zoom out). Large maps stay visible
 * while left/right/top/bottom stay within stable float range near origin.
 */
export const MAX_ORTHO_HALF_EXTENT = 100_000;

/**
 * Clamps a proposed zoom factor so the resulting half-height stays in range.
 * Factor greater than 1 zooms out; less than 1 zooms in.
 * @param currentHalfHeight Current orthographic half-height (world units).
 * @param proposedFactor Multiplier to apply to the frustum size.
 * @returns Factor that keeps half-height within min/max limits.
 */
export function clampOrthoZoomFactor(
  currentHalfHeight: number,
  proposedFactor: number
): number {
  if (!isFinite(currentHalfHeight) || currentHalfHeight <= 0) {
    return 1;
  }
  if (!isFinite(proposedFactor) || proposedFactor <= 0) {
    return 1;
  }
  const proposedHalfHeight = currentHalfHeight * proposedFactor;
  if (proposedHalfHeight > MAX_ORTHO_HALF_EXTENT) {
    return MAX_ORTHO_HALF_EXTENT / currentHalfHeight;
  }
  if (proposedHalfHeight < MIN_ORTHO_HALF_EXTENT) {
    return MIN_ORTHO_HALF_EXTENT / currentHalfHeight;
  }
  return proposedFactor;
}

/**
 * Clamps orthographic half-height to the allowed zoom range.
 * @param halfHeight Proposed half-height in world units.
 * @returns Half-height limited to min/max.
 */
export function clampOrthoHalfExtent(halfHeight: number): number {
  if (!isFinite(halfHeight) || halfHeight <= 0) {
    return MIN_ORTHO_HALF_EXTENT;
  }
  if (halfHeight > MAX_ORTHO_HALF_EXTENT) {
    return MAX_ORTHO_HALF_EXTENT;
  }
  if (halfHeight < MIN_ORTHO_HALF_EXTENT) {
    return MIN_ORTHO_HALF_EXTENT;
  }
  return halfHeight;
}
