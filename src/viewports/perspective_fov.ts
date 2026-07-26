/** Default vertical field of view used by ordinary perspective panes. */
export const DEFAULT_VERTICAL_FOV_DEGREES = 60;

/** Maximum horizontal field of view allowed in wide perspective panes. */
export const MAX_HORIZONTAL_FOV_DEGREES = 90;

/**
 * Calculates a vertical field of view that limits wide-angle distortion.
 *
 * @param aspectRatio Viewport width divided by viewport height.
 * @param defaultVerticalFovDegrees Vertical field of view for ordinary panes.
 * @param maxHorizontalFovDegrees Maximum horizontal field of view.
 * @returns Vertical field of view in degrees.
 */
export function calculatePerspectiveVerticalFov(
  aspectRatio: number,
  defaultVerticalFovDegrees = DEFAULT_VERTICAL_FOV_DEGREES,
  maxHorizontalFovDegrees = MAX_HORIZONTAL_FOV_DEGREES,
): number {
  const defaultVerticalRadians = degreesToRadians(defaultVerticalFovDegrees);
  const maximumHorizontalRadians = degreesToRadians(maxHorizontalFovDegrees);
  const defaultHorizontalRadians = 2 * Math.atan(Math.tan(defaultVerticalRadians / 2) * aspectRatio);
  if (defaultHorizontalRadians <= maximumHorizontalRadians) return defaultVerticalFovDegrees;
  const cappedVerticalRadians = 2 * Math.atan(Math.tan(maximumHorizontalRadians / 2) / aspectRatio);
  return radiansToDegrees(cappedVerticalRadians);
}

/**
 * Converts degrees to radians.
 *
 * @param degrees Angle in degrees.
 * @returns Angle in radians.
 */
function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Converts radians to degrees.
 *
 * @param radians Angle in radians.
 * @returns Angle in degrees.
 */
function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}
