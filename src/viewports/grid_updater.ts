import * as THREE from 'three';

/**
 * Applies snap-interval changes to viewport grids.
 * Infinite grids use the interval as their base cell size / LOD seed.
 */

/**
 * Object that can receive a snap-interval update.
 */
export interface GridSnapTarget {
  /**
   * Sets the snap cell size used by the grid.
   * @param snapInterval Snap step in world units.
   */
  setSnapInterval(snapInterval: number): void;
}

/**
 * Legacy helper retained for tests that still reason about division counts.
 * Maps a snap interval to a nominal division count for a fixed 50-unit span.
 * @param snapInterval The current snap interval value.
 * @returns The clamped division count.
 */
export function computeOptimalDivisions(snapInterval: number): number {
  const gridSize = 50;
  const minDivisions = 1;
  const maxDivisions = 200;
  const raw = Math.round(gridSize / Math.max(snapInterval, 0.001));
  if (raw < minDivisions) return minDivisions;
  if (raw > maxDivisions) return maxDivisions;
  return raw;
}

/**
 * Updates a grid's snap cell size from the editor snap interval.
 * @param grid Target grid supporting setSnapInterval, or a legacy GridHelper.
 * @param snapInterval The new snap interval.
 */
export function updateGridDivisions(
  grid: GridSnapTarget | THREE.GridHelper,
  snapInterval: number
): void {
  if (isGridSnapTarget(grid)) {
    grid.setSnapInterval(snapInterval);
    return;
  }
  if (grid instanceof THREE.GridHelper) {
    const divisions = computeOptimalDivisions(snapInterval);
    (grid as THREE.GridHelper & { divisions: number }).divisions = divisions;
  }
}

/**
 * Type guard for objects that accept snap interval updates.
 * @param value Candidate object.
 * @returns True when setSnapInterval is present.
 */
function isGridSnapTarget(value: unknown): value is GridSnapTarget {
  return (
    typeof value === 'object' &&
    value !== null &&
    'setSnapInterval' in value &&
    typeof (value as GridSnapTarget).setSnapInterval === 'function'
  );
}
