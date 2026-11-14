import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { BrushSpatialIndex } from '@/solid/algorithm/spatial/brush_spatial_index.js';
import { SolidBrushPreparer } from './solid_brush_preparer.js';
import { SolidCompileCache } from './solid_compile_cache.js';
import { SolidCompilePlanner } from './solid_compile_planner.js';
import type { PreparedBrush, SolidCompileOptions, SolidCompileStats } from './solid_compile_types.js';
import { SolidCompiledPolygon } from './solid_compiled_polygon.js';
import { SolidCsgTree, type SolidCsgTreeNode } from './solid_csg_tree.js';
import { SolidFragmentFinalizer } from './solid_fragment_finalizer.js';
import { SolidFragmentRouter } from './solid_fragment_router.js';
import { SolidMembershipEvaluator } from './solid_membership_evaluator.js';
import { SOLID_BOUNDS_EPSILON, SOLID_FAT_PLANE_EPSILON } from '@/solid/algorithm/math/solid_math_constants.js';
import { SolidSurfaceEmitter } from '@/solid/algorithm/surface/solid_surface_emitter.js';
import { forBatchesAsync } from '@/utils/async_yield.js';

export type { SolidCompiledPolygon } from './solid_compiled_polygon.js';
export type { PreparedBrush, SolidCompileOptions, SolidCompileStats } from './solid_compile_types.js';

/**
 * Compiles solid brush instances into surface polygons using ordered
 * categorization, bounds-accelerated peer filtering, and partial updates so
 * only brushes affected by an edit are recompiled.
 */
export class SolidCsgCompiler {
  private readonly membershipEpsilon: number;
  private readonly boundsPad: number;
  private readonly cache = new SolidCompileCache();
  private readonly preparer: SolidBrushPreparer;
  private readonly planner: SolidCompilePlanner;
  private readonly membership: SolidMembershipEvaluator;
  private readonly router = new SolidFragmentRouter();
  private readonly finalizer: SolidFragmentFinalizer;
  private readonly emitter: SolidSurfaceEmitter;
  private hasIntersectingOperations = false;
  private lastUpdateBrushIds: string[] = [];
  private lastStats: SolidCompileStats = {
    fullRebuild: true,
    recompiledBrushCount: 0,
    reusedBrushCount: 0,
    preparedBrushCount: 0,
  };
  private readonly spatialIndex = new BrushSpatialIndex();
  private cachedCsgTree: SolidCsgTree | null = null;
  private cachedCsgTreeRootId = '';
  private cachedCsgTreeBrushIds: string[] = [];
  private cachedCsgTreeOperations: SolidOperation[] = [];

  /**
   * Creates a solid CSG compiler.
   *
   * @param membershipEpsilon Optional fat-plane epsilon for membership tests.
   */
  constructor(membershipEpsilon: number = SOLID_FAT_PLANE_EPSILON) {
    this.membershipEpsilon = membershipEpsilon;
    this.boundsPad = SOLID_BOUNDS_EPSILON;
    this.preparer = new SolidBrushPreparer(this.cache);
    this.planner = new SolidCompilePlanner(this.cache, this.boundsPad);
    this.membership = new SolidMembershipEvaluator(this.membershipEpsilon, this.boundsPad);
    this.finalizer = new SolidFragmentFinalizer(this.router, this.membership);
    this.emitter = new SolidSurfaceEmitter(this.finalizer, this.membershipEpsilon);
  }

  /**
   * Returns diagnostics from the most recent compile.
   *
   * @returns Copy of the last compile stats.
   */
  getLastCompileStats(): SolidCompileStats {
    return { ...this.lastStats };
  }

  /**
   * Returns brush ids whose surfaces were recompiled on the last pass.
   *
   * @returns Brush ids that need mesh-chunk rebuild.
   */
  getLastUpdateBrushIds(): string[] {
    return this.lastUpdateBrushIds.slice();
  }

  /**
   * Returns the brush evaluation order from the last successful compile.
   *
   * @returns Ordered brush ids.
   */
  getLastBrushOrder(): string[] {
    return this.cache.getLastBrushOrder();
  }

  /**
   * Returns the intermediate parent-pose fingerprint stored for a brush at the
   * last prepare/cache write. Used after undo to detect solid CSG group moves
   * when brush local TRS is unchanged.
   *
   * @param brushId Brush instance id.
   * @returns Cached parent-chain key, or undefined when missing.
   */
  getPreparedParentChainPoseKey(brushId: string): string | undefined {
    return this.cache.getPrepared(brushId)?.parentChainPoseKey;
  }

  /**
   * Returns cached compiled polygons for one brush after compile.
   *
   * @param brushId Brush instance id.
   * @returns Polygon list or undefined.
   */
  getCachedPolygons(brushId: string): SolidCompiledPolygon[] | undefined {
    return this.cache.getPolygons(brushId);
  }

  /**
   * Returns previously overlapping peer ids for a brush from the last compile.
   *
   * @param brushId Brush instance id.
   * @returns Peer brush ids.
   */
  getCachedTouchPeerIds(brushId: string): string[] {
    return this.cache.getTouchPeerIds(brushId);
  }

  /**
   * Drops cached data for a removed brush.
   *
   * @param brushId Brush instance id.
   */
  invalidateBrush(brushId: string): void {
    this.cache.removeBrush(brushId);
    this.router.invalidateRoutingTable(brushId);
    this.invalidateSpatialAndTreeCaches();
  }

  /** Clears all compile caches (forces the next compile to rebuild everything). */
  clearCache(): void {
    this.cache.clear();
    this.router.clearRoutingTables();
    this.lastUpdateBrushIds = [];
    this.invalidateSpatialAndTreeCaches();
  }

  /**
   * Drops routing tables only (prepared polygon caches stay). Used when
   * evaluation order changes so prepared indices inside tables are rebuilt on
   * the next subject compile without wiping the whole map. Also drops the
   * cached CSG tree so hierarchy/operation changes rebuild structure.
   */
  clearRoutingTables(): void {
    this.router.clearRoutingTables();
    this.cachedCsgTree = null;
    this.cachedCsgTreeRootId = '';
    this.cachedCsgTreeBrushIds = [];
    this.cachedCsgTreeOperations = [];
  }

  /**
   * Updates texture ids on cached polygons for a brush without recompiling CSG.
   *
   * @param brushId Brush instance id.
   * @param textureForSurface Maps surface index to texture id.
   * @returns True when a polygon cache exists and was updated.
   */
  updateCachedPolygonTextures(brushId: string, textureForSurface: (surfaceIndex: number) => string): boolean {
    const polygons = this.cache.getPolygons(brushId);
    if (!polygons) return false;
    for (const polygon of polygons) {
      polygon.textureId = textureForSurface(polygon.surfaceIndex);
    }
    return true;
  }

  /**
   * Compiles visible brushes into final surface polygons.
   *
   * @param instances Ordered brush instances (tree order = list order).
   * @param options Optional partial-update controls.
   * @returns Compiled surface polygons for meshing.
   */
  compile(instances: SolidBrushInstance[], options: SolidCompileOptions = {}): SolidCompiledPolygon[] {
    const prepared = this.beginCompile(instances, options);
    if (!prepared) return [];
    return this.compileWithCache(prepared, options, false) as SolidCompiledPolygon[];
  }

  /**
   * Compiles surfaces while yielding between brush batches so the UI can
   * update.
   *
   * @param instances Ordered brush instances.
   * @param options Compile options.
   * @param onProgress Optional 0..1 progress for the recompile phase.
   * @returns Assembled polygons unless skipPolygonAssembly is set.
   */
  async compileAsync(
    instances: SolidBrushInstance[],
    options: SolidCompileOptions = {},
    onProgress?: (ratio: number) => void,
  ): Promise<SolidCompiledPolygon[]> {
    const prepared = this.beginCompile(instances, options);
    if (!prepared) {
      onProgress?.(1);
      return [];
    }
    return this.compileWithCache(prepared, options, true, onProgress) as Promise<SolidCompiledPolygon[]>;
  }

  /**
   * Shared setup: prepare brushes, detect intersecting ops, build overlap
   * graph, and install the hierarchical CSG tree when a solid root is
   * provided.
   *
   * @param instances Source instances.
   * @param options Compile options.
   * @returns Prepared list, or null when empty.
   */
  private beginCompile(instances: SolidBrushInstance[], options: SolidCompileOptions): PreparedBrush[] | null {
    this.preparer.clearRefreshedBrushIds();
    const prepared = this.preparer.prepareBrushes(instances, options);
    if (prepared.length === 0) {
      this.recordEmptyCompile();
      return null;
    }
    this.applyIntersectingFlag(prepared);
    this.applyInvertedWorldFlag(options.invertedWorld === true);
    const brushIds = prepared.map((entry) => entry.instance.id);
    const forceFull = this.planner.shouldForceFullRebuild(
      brushIds,
      options,
      this.hasIntersectingOperations,
      this.preparer.getRefreshedBrushIds(),
    );
    this.installCsgTree(prepared, options, forceFull);
    this.syncSpatialIndex(prepared, options, forceFull);
    this.planner.buildOverlapGraph(
      prepared,
      options,
      this.hasIntersectingOperations,
      this.preparer.getRefreshedBrushIds(),
      this.spatialIndex,
    );
    this.membership.setMembershipIndex(this.spatialIndex);
    return prepared;
  }

  /**
   * Builds and installs the hierarchical CSG tree for membership and routing.
   * Reuses the previous tree when brush order, operations, and solid root are
   * unchanged so live transforms avoid a full scene-graph walk. Full rebuilds
   * always rebuild so hierarchy edits are never served from a stale flat tree.
   *
   * @param prepared Prepared brushes in evaluation order.
   * @param options Compile options (optional solid root).
   * @param forceFull Whether this compile is a full rebuild.
   */
  private installCsgTree(prepared: PreparedBrush[], options: SolidCompileOptions, forceFull: boolean): void {
    if (!forceFull && this.cachedCsgTree && this.canReuseCachedCsgTree(prepared, options)) {
      this.applyCsgTree(this.cachedCsgTree);
      return;
    }
    const tree = options.solidRoot
      ? SolidCsgTree.fromSceneGraph(options.solidRoot, prepared)
      : SolidCsgTree.fromPreparedFlat(prepared);
    this.cachedCsgTree = tree;
    this.storeCsgTreeFingerprint(prepared, options);
    this.applyCsgTree(tree);
  }

  /**
   * Installs a CSG tree on membership, routing, and emission collaborators.
   *
   * @param tree Tree to install.
   */
  private applyCsgTree(tree: SolidCsgTree): void {
    this.membership.setCsgTree(tree);
    this.router.setCsgTree(tree);
    this.emitter.setHierarchicalCsg(!tree.isFlat);
  }

  /**
   * Returns whether the cached CSG tree still matches prepared order and ops.
   *
   * @param prepared Prepared brushes.
   * @param options Compile options.
   * @returns True when the cached tree is reusable.
   */
  private canReuseCachedCsgTree(prepared: PreparedBrush[], options: SolidCompileOptions): boolean {
    const rootId = options.solidRoot ? options.solidRoot.uuid : 'flat';
    if (rootId !== this.cachedCsgTreeRootId) {
      return false;
    }
    if (prepared.length !== this.cachedCsgTreeBrushIds.length) {
      return false;
    }
    for (let index = 0; index < prepared.length; index++) {
      const entry = prepared[index]!;
      if (this.cachedCsgTreeBrushIds[index] !== entry.instance.id) {
        return false;
      }
      if (this.cachedCsgTreeOperations[index] !== entry.operation) {
        return false;
      }
    }
    return true;
  }

  /**
   * Stores brush order and operations for CSG tree reuse checks.
   *
   * @param prepared Prepared brushes.
   * @param options Compile options.
   */
  private storeCsgTreeFingerprint(prepared: PreparedBrush[], options: SolidCompileOptions): void {
    this.cachedCsgTreeRootId = options.solidRoot ? options.solidRoot.uuid : 'flat';
    this.cachedCsgTreeBrushIds = prepared.map((entry) => entry.instance.id);
    this.cachedCsgTreeOperations = prepared.map((entry) => entry.operation);
  }

  /**
   * Rebuilds or incrementally updates the persistent spatial index. Matches
   * CacheRemappingJob: when brush tree order changes, index-ordered caches must
   * be remapped; we rebuild the prepared-index grid so partial peer queries are
   * not served from stale slots after To Last / reorder.
   *
   * @param prepared Prepared brushes.
   * @param options Compile options.
   * @param forceFull Whether this compile is a full rebuild.
   */
  private syncSpatialIndex(prepared: PreparedBrush[], options: SolidCompileOptions, forceFull: boolean): void {
    void options;
    if (this.spatialIndexNeedsFullRebuild(prepared, forceFull)) {
      this.spatialIndex.rebuild(prepared, this.boundsPad);
      return;
    }
    this.upsertRefreshedSpatialEntries(prepared);
  }

  /**
   * Returns whether the spatial index must be rebuilt from prepared order.
   *
   * @param prepared Prepared brushes in evaluation order.
   * @param forceFull Whether this compile is a full rebuild.
   * @returns True when incremental upsert would leave index slots wrong.
   */
  private spatialIndexNeedsFullRebuild(prepared: PreparedBrush[], forceFull: boolean): boolean {
    if (forceFull) {
      return true;
    }
    if (this.spatialIndex.getEntryCount() !== prepared.length) {
      return true;
    }
    return !this.cache.orderMatchesPrepared(prepared.length, (index) => prepared[index]!.instance.id);
  }

  /**
   * Upserts bounds for brushes refreshed during prepare into the spatial index.
   *
   * @param prepared Prepared brushes.
   */
  private upsertRefreshedSpatialEntries(prepared: PreparedBrush[]): void {
    const refreshed = this.preparer.getRefreshedBrushIds();
    if (refreshed.size === 0) {
      return;
    }
    for (let index = 0; index < prepared.length; index++) {
      const entry = prepared[index]!;
      if (!refreshed.has(entry.instance.id)) {
        continue;
      }
      this.spatialIndex.upsert(index, entry.bounds);
    }
  }

  /**
   * Clears persistent spatial and tree caches so the next compile rebuilds
   * them.
   */
  private invalidateSpatialAndTreeCaches(): void {
    this.spatialIndex.clear();
    this.cachedCsgTree = null;
    this.cachedCsgTreeRootId = '';
    this.cachedCsgTreeBrushIds = [];
    this.cachedCsgTreeOperations = [];
  }

  /**
   * Propagates inverted-world mode to membership, routing, and emission.
   *
   * @param invertedWorld True when CSG starts as solid.
   */
  private applyInvertedWorldFlag(invertedWorld: boolean): void {
    this.membership.setInvertedWorld(invertedWorld);
    this.router.setInvertedWorld(invertedWorld);
    this.emitter.setInvertedWorld(invertedWorld);
  }

  /**
   * Runs full or partial compilation against the persistent cache.
   *
   * @param prepared Prepared brushes in tree order.
   * @param options Compile options.
   * @param asyncRecompile When true, yields between recompile batches.
   * @param onProgress Optional progress for async recompile (0..1).
   * @returns Assembled polygon list.
   */
  private compileWithCache(
    prepared: PreparedBrush[],
    options: SolidCompileOptions,
    asyncRecompile: boolean,
    onProgress?: (ratio: number) => void,
  ): SolidCompiledPolygon[] | Promise<SolidCompiledPolygon[]> {
    const brushIds = prepared.map((entry) => entry.instance.id);
    const forceFull = this.planner.shouldForceFullRebuild(
      brushIds,
      options,
      this.hasIntersectingOperations,
      this.preparer.getRefreshedBrushIds(),
    );
    if (forceFull) {
      this.router.clearRoutingTables();
      this.emitter.clearReplayRecords();
    }
    const updateSet = this.resolveUpdateSet(prepared, options, forceFull);
    if (asyncRecompile) {
      return this.finishCompileAsync(prepared, options, forceFull, updateSet, brushIds, onProgress);
    }
    this.recompileUpdateSet(prepared, updateSet);
    this.finalizeCompileState(prepared, forceFull, updateSet, brushIds);
    if (options.skipPolygonAssembly) return [];
    return this.assemblePolygons(prepared);
  }

  /**
   * Async recompile path with browser yields between brush batches.
   *
   * @param prepared Prepared brushes.
   * @param options Compile options.
   * @param forceFull Whether this was a full rebuild.
   * @param updateSet Brush ids to recompile.
   * @param brushIds Prepared brush id order.
   * @param onProgress Optional progress callback.
   * @returns Assembled polygons (or empty when skipped).
   */
  private async finishCompileAsync(
    prepared: PreparedBrush[],
    options: SolidCompileOptions,
    forceFull: boolean,
    updateSet: Set<string>,
    brushIds: string[],
    onProgress?: (ratio: number) => void,
  ): Promise<SolidCompiledPolygon[]> {
    await this.recompileUpdateSetAsync(prepared, updateSet, onProgress);
    this.finalizeCompileState(prepared, forceFull, updateSet, brushIds);
    if (options.skipPolygonAssembly) return [];
    return this.assemblePolygons(prepared);
  }

  /**
   * Stores touch caches, order, stats after recompile.
   *
   * @param prepared Prepared brushes.
   * @param forceFull Full rebuild flag.
   * @param updateSet Recompiled brush ids.
   * @param brushIds Prepared order.
   */
  private finalizeCompileState(
    prepared: PreparedBrush[],
    forceFull: boolean,
    updateSet: Set<string>,
    brushIds: string[],
  ): void {
    this.storeTouchCaches(prepared, forceFull ? null : updateSet);
    const keptBrushIds = new Set(brushIds);
    this.cache.pruneToIds(keptBrushIds);
    this.emitter.pruneReplayRecords(keptBrushIds);
    this.cache.setLastBrushOrder(brushIds);
    this.lastUpdateBrushIds = Array.from(updateSet);
    this.recordCompileStats(forceFull, updateSet.size, prepared.length);
  }

  /**
   * Stores diagnostics for the completed compile pass.
   *
   * @param fullRebuild Whether every brush was recompiled.
   * @param recompiledBrushCount Brushes regenerated this pass.
   * @param preparedBrushCount Visible brush count.
   */
  private recordCompileStats(fullRebuild: boolean, recompiledBrushCount: number, preparedBrushCount: number): void {
    this.lastStats = {
      fullRebuild,
      recompiledBrushCount,
      reusedBrushCount: preparedBrushCount - recompiledBrushCount,
      preparedBrushCount,
    };
  }

  /**
   * Recompiles every brush in the update set and writes polygon cache entries.
   *
   * @param prepared All prepared brushes.
   * @param updateSet Brush ids to recompile.
   */
  private recompileUpdateSet(prepared: PreparedBrush[], updateSet: Set<string>): void {
    const indices = this.collectUpdateIndices(prepared, updateSet);
    for (const brushIndex of indices) {
      this.recompileOnePreparedBrush(prepared, brushIndex);
    }
  }

  /**
   * Recompiles update-set brushes in batches, yielding to the browser between
   * them.
   *
   * @param prepared All prepared brushes.
   * @param updateSet Brush ids to recompile.
   * @param onProgress Optional 0..1 progress.
   */
  private async recompileUpdateSetAsync(
    prepared: PreparedBrush[],
    updateSet: Set<string>,
    onProgress?: (ratio: number) => void,
  ): Promise<void> {
    const indices = this.collectUpdateIndices(prepared, updateSet);
    await forBatchesAsync(
      indices.length,
      20,
      (start, end) => {
        for (let i = start; i < end; i++) {
          const brushIndex = indices[i];
          if (brushIndex === undefined) continue;
          this.recompileOnePreparedBrush(prepared, brushIndex);
        }
      },
      onProgress,
    );
  }

  /**
   * Lists prepared indices that belong to the update set (tree order).
   *
   * @param prepared Prepared brushes.
   * @param updateSet Brush ids to recompile.
   * @returns Indices into prepared.
   */
  private collectUpdateIndices(prepared: PreparedBrush[], updateSet: Set<string>): number[] {
    const indices: number[] = [];
    for (let brushIndex = 0; brushIndex < prepared.length; brushIndex++) {
      const entry = prepared[brushIndex];
      if (entry && updateSet.has(entry.instance.id)) {
        indices.push(brushIndex);
      }
    }
    return indices;
  }

  /**
   * Compiles surfaces for one prepared brush into the polygon cache.
   *
   * @param prepared All prepared brushes.
   * @param brushIndex Index of the brush to compile.
   */
  private recompileOnePreparedBrush(prepared: PreparedBrush[], brushIndex: number): void {
    const entry = prepared[brushIndex];
    if (!entry) return;
    const polygons: SolidCompiledPolygon[] = [];
    this.emitter.compileBrushSurfaces(prepared, brushIndex, polygons);
    this.cache.setPolygons(entry.instance.id, polygons);
  }

  /**
   * Writes current overlap peers with IntersectionType into the persistent
   * touch cache.
   *
   * @param prepared Prepared brushes after overlap build.
   * @param onlyBrushIds When set, only those brush ids are written.
   */
  private storeTouchCaches(prepared: PreparedBrush[], onlyBrushIds: Set<string> | null): void {
    for (let brushIndex = 0; brushIndex < prepared.length; brushIndex++) {
      const entry = prepared[brushIndex]!;
      if (onlyBrushIds && !onlyBrushIds.has(entry.instance.id)) {
        continue;
      }
      const peers = this.planner.buildTypedTouchesForBrush(prepared, brushIndex);
      this.cache.setTouchPeers(entry.instance.id, peers);
    }
  }

  /**
   * Concatenates cached polygons in tree order.
   *
   * @param prepared Prepared brushes in evaluation order.
   * @returns Full polygon soup for meshing.
   */
  private assemblePolygons(prepared: PreparedBrush[]): SolidCompiledPolygon[] {
    const output: SolidCompiledPolygon[] = [];
    for (const entry of prepared) {
      const cached = this.cache.getPolygons(entry.instance.id);
      if (!cached) continue;
      for (const polygon of cached) {
        output.push(polygon);
      }
    }
    return output;
  }

  /** Records empty-compile stats and clears caches when no brushes are visible. */
  private recordEmptyCompile(): void {
    this.cache.clear();
    this.router.clearRoutingTables();
    this.invalidateSpatialAndTreeCaches();
    this.lastUpdateBrushIds = [];
    this.lastStats = {
      fullRebuild: true,
      recompiledBrushCount: 0,
      reusedBrushCount: 0,
      preparedBrushCount: 0,
    };
  }

  /**
   * Detects intersecting operations and propagates the flag to collaborators.
   * Includes brush operations only; hierarchical group ops are handled by the
   * CSG tree evaluator regardless of this flag.
   *
   * @param prepared Prepared brushes.
   */
  private applyIntersectingFlag(prepared: PreparedBrush[]): void {
    this.hasIntersectingOperations = prepared.some((entry) => entry.operation === SolidOperation.Intersecting);
    this.membership.setHasIntersectingOperations(this.hasIntersectingOperations);
    this.router.setHasIntersectingOperations(this.hasIntersectingOperations);
    this.emitter.setHasIntersectingOperations(this.hasIntersectingOperations);
  }

  /**
   * Resolves the set of brush ids that must be recompiled this pass. Uses
   * -style touch expansion only (seed + previous/current peers). Distant ∩
   * never forces a map-wide recompile of non-touching brushes.
   *
   * @param prepared Prepared brushes.
   * @param options Compile options.
   * @param forceFull Whether every brush must recompile.
   * @returns Update set of brush ids.
   */
  private resolveUpdateSet(prepared: PreparedBrush[], options: SolidCompileOptions, forceFull: boolean): Set<string> {
    if (forceFull) {
      return new Set(prepared.map((entry) => entry.instance.id));
    }
    return this.planner.buildPartialUpdateSet(
      prepared,
      options,
      this.preparer.getRefreshedBrushIds(),
      this.intersectingBrushIds(prepared),
    );
  }

  /**
   * Per tree: prepared indices of brushes that are (part of) an intersecting
   * node.
   */
  private static readonly intersectingIndicesByTree = new WeakMap<SolidCsgTree, number[]>();

  /**
   * Ids of brushes that are, or sit inside, an intersecting node of the current
   * tree (cached per tree).
   *
   * @param prepared Prepared brushes.
   * @returns Brush ids, or undefined when there are none.
   */
  private intersectingBrushIds(prepared: readonly PreparedBrush[]): Set<string> | undefined {
    const tree = this.cachedCsgTree;
    if (!tree) return undefined;
    let indices = SolidCsgCompiler.intersectingIndicesByTree.get(tree);
    if (!indices) {
      indices = [];
      const visit = (nodes: readonly SolidCsgTreeNode[], inside: boolean): void => {
        for (const node of nodes) {
          const within = inside || node.operation === SolidOperation.Intersecting;
          if (node.kind === 'brush') {
            if (within) indices!.push(node.preparedIndex);
          } else {
            visit(node.children, within);
          }
        }
      };
      visit(tree.roots, false);
      SolidCsgCompiler.intersectingIndicesByTree.set(tree, indices);
    }
    if (indices.length === 0) return undefined;
    const ids = new Set<string>();
    for (const index of indices) {
      const entry = prepared[index];
      if (entry) ids.add(entry.instance.id);
    }
    return ids;
  }
}
