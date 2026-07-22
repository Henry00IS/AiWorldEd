/**
 * Computes an ease-out cubic interpolation value.
 * Provides smooth deceleration from t=0 to t=1.
 * @param t The normalized interpolation parameter between 0 and 1.
 * @returns The eased value between 0 and 1.
 */
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
