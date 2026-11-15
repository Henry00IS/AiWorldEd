import type { PhysicsShatterBadPiece, PhysicsShatterCell } from './physics_shatter_voronoi.js';

/** A cell the healing found bad, and how. */
export interface PhysicsShatterBadCell {
  /** Cell index. */
  cellIndex: number;
  /**
   * True when the cell is too small, too thin or broken, so it has to merge;
   * false when only an edge is too short or a face too small, which moving its
   * cracks a little can fix.
   */
  small: boolean;
  /** The worst bad piece of the cell, when it was built. */
  piece?: PhysicsShatterBadPiece | undefined;
}

/**
 * A fracture pattern over one input brush that can heal its own bad cells. A
 * bad cell is never dropped: the pattern merges it into its neighbours (a
 * removed Voronoi site, a removed brick joint, a removed ring or spoke), so the
 * neighbours grow over the space and the input keeps its whole volume.
 */
export interface PhysicsShatterPattern {
  /**
   * Returns the current cells in cell index order. A cell the last repair did
   * not touch is returned as the very same object, so its carving can be
   * reused.
   *
   * @returns Cells.
   */
  cells(): readonly PhysicsShatterCell[];
  /**
   * Merges bad cells into their neighbours, or moves their cracks, worst first.
   *
   * @param bad Bad cells, worst first.
   * @returns True when anything changed.
   */
  repair(bad: readonly PhysicsShatterBadCell[]): boolean;
}
