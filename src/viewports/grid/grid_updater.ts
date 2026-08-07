import * as THREE from 'three';

/**
 * Applies snap-interval changes to viewport grids. Infinite grids use the
 * interval as their base cell size / LOD seed.
 */

/** Object that can receive a snap-interval update. */
export interface GridSnapTarget {
  /**
   * Sets the snap cell size in world units.
   *
   * @param snapInterval Snap step in world units.
   */
  setSnapInterval(snapInterval: number): void;
}

/**
 * Maps a snap interval to a nominal division count for a fixed 50-unit span.
 *
 * @param snapInterval Snap step in world units.
 * @returns Division count clamped between 1 and 200.
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
 * Applies a snap interval to a grid target, or writes a derived division count
 * onto a GridHelper.
 *
 * @param grid Target implementing setSnapInterval, or a THREE.GridHelper.
 * @param snapInterval Snap step in world units.
 */
export function updateGridDivisions(grid: GridSnapTarget | THREE.GridHelper, snapInterval: number): void {
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
 *
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
