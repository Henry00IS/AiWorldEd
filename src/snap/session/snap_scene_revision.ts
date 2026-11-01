/** Counts scene edits made outside the local tools, such as a room member's. */
let externalRevision = 0;

/**
 * Records that the scene changed outside the local tools (a remote member's
 * move, delete or rebuild applied by collaboration). Snap drags drop a held
 * target and align tools rebuild their cached targets on the next query, so
 * nothing snaps to a stale or deleted object.
 */
export function snapSceneExternalEditNotify(): void {
  externalRevision += 1;
}

/**
 * Returns the external edit revision. A different value than the one a cache
 * was built at means its targets may be stale.
 *
 * @returns Revision counter.
 */
export function snapSceneExternalRevision(): number {
  return externalRevision;
}
