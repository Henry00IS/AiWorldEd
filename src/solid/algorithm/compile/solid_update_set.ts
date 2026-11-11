import { SolidAlgorithmIntersectionType } from '@/solid/algorithm/routing/solid_algorithm_intersection_type.js';
import type { SolidCompileTouchPeer } from './solid_compile_cache.js';

/**
 * Builds the set of brushes that must be recompiled after an edit by expanding
 * seed dirty brushes with spatial neighbors that need surface updates.
 *
 * Pair-type surface semantics:
 *
 * - Intersection: surface loops are built for both sides; both rebuild.
 * - BInsideA (peer inside seed): the inner peer is fully recategorized and must
 *   recompile.
 * - AInsideB (seed inside peer): outer peer surface loops are unchanged, so the
 *   outer peer is not force-recompiled.
 *
 * Intentionally one-hop: peers of peers are not recompiled.
 */
export class SolidUpdateSetBuilder {
  /**
   * Expands seed dirty brush ids into the full recompile set.
   *
   * @param seedDirtyIds Brushes known to have changed.
   * @param preparedBrushIds All visible brush ids in tree order.
   * @param currentTouchPeersByBrushId Current touch peers keyed by brush id.
   * @param previousTouchPeersByBrushId Previous touch peers keyed by brush id.
   * @returns Brush ids that need surface recompilation.
   */
  static build(
    seedDirtyIds: ReadonlySet<string>,
    preparedBrushIds: readonly string[],
    currentTouchPeersByBrushId: ReadonlyMap<string, readonly SolidCompileTouchPeer[]>,
    previousTouchPeersByBrushId: ReadonlyMap<string, readonly SolidCompileTouchPeer[]>,
  ): Set<string> {
    const preparedIdSet = new Set(preparedBrushIds);
    const updateSet = new Set<string>();
    for (const brushId of seedDirtyIds) {
      this.addSurfaceAffectingPeers(updateSet, previousTouchPeersByBrushId.get(brushId));
      if (!preparedIdSet.has(brushId)) {
        continue;
      }
      updateSet.add(brushId);
      this.addSurfaceAffectingPeers(updateSet, currentTouchPeersByBrushId.get(brushId));
    }
    return updateSet;
  }

  /**
   * Adds peers whose pair type requires a surface rebuild of that peer.
   *
   * @param updateSet Accumulator set.
   * @param peers Optional typed peer list from the seed's perspective.
   */
  private static addSurfaceAffectingPeers(
    updateSet: Set<string>,
    peers: readonly SolidCompileTouchPeer[] | undefined,
  ): void {
    if (!peers) {
      return;
    }
    for (const peer of peers) {
      if (this.peerNeedsSurfaceRebuild(peer.type)) {
        updateSet.add(peer.peerId);
      }
    }
  }

  /**
   * Returns whether a seed-to-peer intersection type forces the peer to
   * recompile. Every bounds-overlapping peer recompiles except one that fully
   * contains the seed: a peer whose bounds overlap a separated seed still
   * receives intersection loops from it in a full rebuild, so skipping it
   * would leave a live result that differs from the full rebuild.
   *
   * @param type Pair type from the seed brush's touch list.
   * @returns True when the peer brush must be in the update set.
   */
  private static peerNeedsSurfaceRebuild(type: SolidAlgorithmIntersectionType): boolean {
    return type !== SolidAlgorithmIntersectionType.AInsideB;
  }
}
