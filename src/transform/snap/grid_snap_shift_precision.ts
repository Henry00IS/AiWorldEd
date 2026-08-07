import type { GridSnap } from './grid_snap.js';

/**
 * Disables grid snap while Shift is held; otherwise sets grid snap enabled to
 * the user snap preference.
 *
 * @param gridSnap Grid snap instance whose enabled state is updated.
 * @param shiftHeld True when Shift is held.
 * @param userSnapEnabled User snap preference applied when Shift is not held.
 */
export function applyGridSnapPrecisionFromShift(
  gridSnap: GridSnap,
  shiftHeld: boolean,
  userSnapEnabled: boolean,
): void {
  if (shiftHeld) {
    gridSnap.setEnabled(false);
    return;
  }
  gridSnap.setEnabled(userSnapEnabled);
}

/**
 * Sets grid snap enabled state to the user snap preference.
 *
 * @param gridSnap Grid snap instance whose enabled state is updated.
 * @param userSnapEnabled User snap preference to apply as the enabled state.
 */
export function restoreGridSnapUserPreference(gridSnap: GridSnap, userSnapEnabled: boolean): void {
  gridSnap.setEnabled(userSnapEnabled);
}
