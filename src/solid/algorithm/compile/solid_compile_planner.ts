import { BrushOverlapGraph } from '@/solid/algorithm/spatial/brush_overlap_graph.js';
import type { BrushSpatialIndex } from '@/solid/algorithm/spatial/brush_spatial_index.js';
import { SolidAlgorithmBrushIntersection } from '@/solid/algorithm/routing/solid_algorithm_brush_intersection.js';
import { SOLID_FAT_PLANE_EPSILON } from '@/solid/algorithm/math/solid_math_constants.js';
import { SolidCompileCache, type SolidCompileTouchPeer } from './solid_compile_cache.js';
import type { PreparedBrush, SolidCompileOptions } from './solid_compile_types.js';
import { SolidUpdateSetBuilder } from './solid_update_set.js';

/**
 * Plans full versus partial solid CSG recompiles: overlap graphs, dirty seeds,
 * touch maps, and update sets.
 */
export class SolidCompilePlanner {
  private readonly cache: SolidCompileCache;
  private readonly boundsPad: number;

  /**
   * Creates a compile planner.
   *
   * @param cache Compile cache for touch peers and polygon reuse checks.
   * @param boundsPad Padding for bounds-overlap tests.
   */
  constructor(cache: SolidCompileCache, boundsPad: number) {
    this.cache = cache;
    this.boundsPad = boundsPad;
  }

  /**
   * Builds full or partial bounds-overlap adjacency for prepared brushes.
   *
   * @param prepared Prepared brushes with empty overlap lists.
   * @param options Compile options with optional dirty seeds.
   * @param hasIntersectingOperations Whether intersecting ops force full work.
   * @param refreshedBrushIds Brushes refreshed during prepare.
   * @param spatialIndex Optional persistent index for neighbor queries.
   */
  buildOverlapGraph(
    prepared: PreparedBrush[],
    options: SolidCompileOptions,
    hasIntersectingOperations: boolean,
    refreshedBrushIds: ReadonlySet<string>,
    spatialIndex?: BrushSpatialIndex,
  ): void {
    const brushIds = prepared.map((entry) => entry.instance.id);
    if (this.shouldForceFullRebuild(brushIds, options, hasIntersectingOperations, refreshedBrushIds)) {
      BrushOverlapGraph.build(prepared, this.boundsPad, spatialIndex);
      return;
    }
    this.buildPartialOrFullOverlapGraph(prepared, options, refreshedBrushIds, spatialIndex);
  }

  /**
   * Maps dirty brush ids to prepared indices (including auto-refreshed ids).
   *
   * @param prepared Prepared brushes.
   * @param options Compile options.
   * @param refreshedBrushIds Brushes refreshed during prepare.
   * @returns Seed index set.
   */
  resolveSeedIndices(
    prepared: PreparedBrush[],
    options: SolidCompileOptions,
    refreshedBrushIds: ReadonlySet<string>,
  ): Set<number> {
    const seedIds = this.collectSeedDirtyIds(options, refreshedBrushIds);
    const indices = new Set<number>();
    for (let index = 0; index < prepared.length; index++) {
      if (seedIds.has(prepared[index]!.instance.id)) {
        indices.add(index);
      }
    }
    return indices;
  }

  /**
   * Loads previous overlap peer indices from the touch cache.
   *
   * @param prepared Prepared brushes.
   * @returns Peer index lists aligned with prepared order.
   */
  loadPreviousPeerIndices(prepared: PreparedBrush[]): number[][] {
    const idToIndex = this.buildIdToIndexMap(prepared);
    return prepared.map((entry) => this.mapPeerIdsToIndices(entry.instance.id, idToIndex));
  }

  /**
   * Returns whether a full rebuild is required for this pass. Intersecting
   * operations no longer force a full map recompile — partial touch expansion
   * plus full membership walks on the recompile set match Sander-style
   * iterative updates (only dirty brushes and their neighbors).
   *
   * @param brushIds Visible brush ids in order.
   * @param options Compile options.
   * @param hasIntersectingOperations Unused; kept for call-site compatibility.
   * @param refreshedBrushIds Brushes refreshed during prepare.
   * @returns True when every brush must be recompiled.
   */
  shouldForceFullRebuild(
    brushIds: string[],
    options: SolidCompileOptions,
    hasIntersectingOperations: boolean,
    refreshedBrushIds: ReadonlySet<string>,
  ): boolean {
    void hasIntersectingOperations;
    if (options.forceFull) {
      return true;
    }
    if (!options.dirtyBrushIds) {
      return true;
    }
    const seed = this.collectSeedDirtyIds(options, refreshedBrushIds);
    return !this.canReuseCachedBrushes(brushIds, seed);
  }

  /**
   * Collects seed dirty ids including brushes refreshed during prepare.
   *
   * @param options Compile options.
   * @param refreshedBrushIds Brushes refreshed during prepare.
   * @returns Seed set for partial updates.
   */
  collectSeedDirtyIds(options: SolidCompileOptions, refreshedBrushIds: ReadonlySet<string>): Set<string> {
    const seed = new Set(options.dirtyBrushIds ?? []);
    for (const brushId of refreshedBrushIds) {
      seed.add(brushId);
    }
    return seed;
  }

  /**
   * Returns whether non-seed brushes can keep their cached polygons.
   *
   * @param brushIds Current visible brush ids in order.
   * @param seedDirtyIds Brushes that will be recompiled.
   * @returns True when partial reuse is safe.
   */
  canReuseCachedBrushes(brushIds: string[], seedDirtyIds: ReadonlySet<string>): boolean {
    if (!this.allNonSeedHavePolygons(brushIds, seedDirtyIds)) {
      return false;
    }
    if (this.cache.orderMatches(brushIds)) {
      return true;
    }
    const reusableIds = brushIds.filter((id) => !seedDirtyIds.has(id));
    return this.reusableOrderMatchesCache(reusableIds);
  }

  /**
   * Returns whether every non-seed brush has cached polygons.
   *
   * @param brushIds Current visible brush ids.
   * @param seedDirtyIds Brushes that will recompile.
   * @returns True when all non-seed brushes have polygon cache entries.
   */
  private allNonSeedHavePolygons(brushIds: readonly string[], seedDirtyIds: ReadonlySet<string>): boolean {
    for (const brushId of brushIds) {
      if (seedDirtyIds.has(brushId)) {
        continue;
      }
      if (!this.cache.getPolygons(brushId)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Builds the partial recompile set from seed dirty ids and touch peers. Only
   * Intersection-type peers expand the set.
   *
   * @param prepared Prepared brushes.
   * @param options Compile options with dirty seeds.
   * @param refreshedBrushIds Brushes refreshed during prepare.
   * @param intersectingIds Brushes that are (part of) an intersecting node.
   *   Such a seed changes which of its peers are clipped, and a clipped peer
   *   changes how its own peers are routed, so their peers recompile too.
   * @returns Brush ids to recompile.
   */
  buildPartialUpdateSet(
    prepared: PreparedBrush[],
    options: SolidCompileOptions,
    refreshedBrushIds: ReadonlySet<string>,
    intersectingIds?: ReadonlySet<string>,
  ): Set<string> {
    const seed = this.collectSeedDirtyIds(options, refreshedBrushIds);
    const brushIds = prepared.map((entry) => entry.instance.id);
    const currentTouches = this.buildCurrentTouchMapForSeeds(prepared, seed);
    const previousTouches = this.buildPreviousTouchMapForSeeds(seed);
    const updateSet = SolidUpdateSetBuilder.build(seed, brushIds, currentTouches, previousTouches);
    if (intersectingIds && intersectingIds.size > 0) {
      this.addPeersOfClippedPeers(updateSet, seed, brushIds, intersectingIds, currentTouches, previousTouches);
    }
    return updateSet;
  }

  /**
   * Adds the peers of every peer of an intersecting seed.
   *
   * @param updateSet Update set, extended in place.
   * @param seed Seed dirty ids.
   * @param brushIds Current brush ids.
   * @param intersectingIds Brushes that are (part of) an intersecting node.
   * @param currentTouches Current seed touches.
   * @param previousTouches Previous seed touches.
   */
  private addPeersOfClippedPeers(
    updateSet: Set<string>,
    seed: ReadonlySet<string>,
    brushIds: readonly string[],
    intersectingIds: ReadonlySet<string>,
    currentTouches: ReadonlyMap<string, readonly SolidCompileTouchPeer[]>,
    previousTouches: ReadonlyMap<string, readonly SolidCompileTouchPeer[]>,
  ): void {
    let present: Set<string> | null = null;
    for (const seedId of seed) {
      if (!intersectingIds.has(seedId)) continue;
      present ??= new Set(brushIds);
      for (const touches of [currentTouches.get(seedId), previousTouches.get(seedId)]) {
        for (const peer of touches ?? []) {
          for (const next of this.cache.getTouchPeersReadonly(peer.peerId)) {
            if (present.has(next.peerId)) updateSet.add(next.peerId);
          }
        }
      }
    }
  }

  /**
   * Builds current typed touch lists for seed brushes (AABB peers classified
   * with ConvexPolytopeTouching).
   *
   * @param prepared Prepared brushes with overlap indices.
   * @param seedIds Seed dirty brush ids.
   * @returns Map of brush id to typed touch peers.
   */
  buildCurrentTouchMapForSeeds(
    prepared: PreparedBrush[],
    seedIds: ReadonlySet<string>,
  ): Map<string, SolidCompileTouchPeer[]> {
    const map = new Map<string, SolidCompileTouchPeer[]>();
    const idToIndex = this.buildIdToIndexMap(prepared);
    for (const seedId of seedIds) {
      const index = idToIndex.get(seedId);
      if (index === undefined) {
        continue;
      }
      map.set(seedId, this.buildTypedTouchesForBrush(prepared, index));
    }
    return map;
  }

  /**
   * Loads previous typed touch peers for seed brushes from cache.
   *
   * @param seedIds Seed dirty brush ids.
   * @returns Map of brush id to previous typed peers.
   */
  buildPreviousTouchMapForSeeds(seedIds: ReadonlySet<string>): Map<string, SolidCompileTouchPeer[]> {
    const map = new Map<string, SolidCompileTouchPeer[]>();
    for (const brushId of seedIds) {
      map.set(brushId, this.cache.getTouchPeers(brushId));
    }
    return map;
  }

  /**
   * Classifies AABB peers of one prepared brush into typed touch records.
   *
   * @param prepared Prepared brushes.
   * @param brushIndex Subject prepared index.
   * @returns Typed touch peers.
   */
  buildTypedTouchesForBrush(prepared: PreparedBrush[], brushIndex: number): SolidCompileTouchPeer[] {
    const subject = prepared[brushIndex];
    if (!subject) {
      return [];
    }
    const peers: SolidCompileTouchPeer[] = [];
    for (const peerIndex of subject.overlappingPeerIndices) {
      const peer = prepared[peerIndex];
      if (!peer) {
        continue;
      }
      const type = SolidAlgorithmBrushIntersection.classify(
        subject,
        peerIndex,
        prepared,
        this.boundsPad,
        SOLID_FAT_PLANE_EPSILON,
      );
      peers.push({ peerId: peer.instance.id, type });
    }
    return peers;
  }

  /**
   * Builds partial overlap when seeds are small, otherwise full overlap.
   *
   * @param prepared Prepared brushes.
   * @param options Compile options.
   * @param refreshedBrushIds Brushes refreshed during prepare.
   * @param spatialIndex Optional persistent index.
   */
  private buildPartialOrFullOverlapGraph(
    prepared: PreparedBrush[],
    options: SolidCompileOptions,
    refreshedBrushIds: ReadonlySet<string>,
    spatialIndex?: BrushSpatialIndex,
  ): void {
    const seedIndices = this.resolveSeedIndices(prepared, options, refreshedBrushIds);
    if (seedIndices.size === 0 || seedIndices.size >= prepared.length) {
      BrushOverlapGraph.build(prepared, this.boundsPad, spatialIndex);
      return;
    }
    const previousPeers = this.loadPreviousPeerIndices(prepared);
    BrushOverlapGraph.buildPartial(prepared, this.boundsPad, seedIndices, previousPeers, spatialIndex);
  }

  /**
   * Builds a map from brush id to prepared index.
   *
   * @param prepared Prepared brushes.
   * @returns Id-to-index map.
   */
  private buildIdToIndexMap(prepared: PreparedBrush[]): Map<string, number> {
    const idToIndex = new Map<string, number>();
    for (let index = 0; index < prepared.length; index++) {
      idToIndex.set(prepared[index]!.instance.id, index);
    }
    return idToIndex;
  }

  /**
   * Maps cached peer ids for one brush onto prepared indices.
   *
   * @param brushId Brush instance id.
   * @param idToIndex Id-to-index map for the prepared list.
   * @returns Peer indices present in the prepared list.
   */
  private mapPeerIdsToIndices(brushId: string, idToIndex: Map<string, number>): number[] {
    const peers = this.cache.getTouchPeersReadonly(brushId);
    if (peers.length === 0) {
      return SolidCompilePlanner.emptyPeerIndices;
    }
    const peerIndices: number[] = [];
    for (const peer of peers) {
      const peerIndex = idToIndex.get(peer.peerId);
      if (peerIndex !== undefined) {
        peerIndices.push(peerIndex);
      }
    }
    return peerIndices;
  }

  /** Shared empty peer index list for brushes with no previous overlaps. */
  private static readonly emptyPeerIndices: number[] = [];

  /**
   * Returns whether reusable brush order matches the previous compile order.
   *
   * @param reusableIds Current reusable ids in tree order.
   * @returns True when relative order is stable.
   */
  private reusableOrderMatchesCache(reusableIds: string[]): boolean {
    const reusableSet = new Set(reusableIds);
    const previousReusable = this.cache.getLastBrushOrder().filter((id) => reusableSet.has(id));
    if (previousReusable.length !== reusableIds.length) return false;
    for (let index = 0; index < reusableIds.length; index++) {
      if (previousReusable[index] !== reusableIds[index]) return false;
    }
    return true;
  }
}
