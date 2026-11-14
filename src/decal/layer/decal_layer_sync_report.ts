/** Work counts of one decal synchronization pass. */
export interface DecalLayerSyncReport {
  /** Brushes whose chunk changed since the previous pass. */
  changedBrushes: number;
  /** Decals whose geometry was rebuilt. */
  rebuiltDecals: number;
  /** Decals left for a later pass because the budget ran out. */
  deferredDecals: number;
}

/**
 * Returns a report with every count at zero.
 *
 * @returns Empty report.
 */
export function decalLayerSyncReportEmpty(): DecalLayerSyncReport {
  return { changedBrushes: 0, rebuiltDecals: 0, deferredDecals: 0 };
}
