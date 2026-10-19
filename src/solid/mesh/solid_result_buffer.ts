import * as THREE from 'three';
import { SolidSurfaceRegion, SolidTriangleSource } from '@/solid/algorithm/surface/surface_triangulator.js';
import { invalidateFacePickAcceleration } from '@/selection/pick/mesh_pick_acceleration.js';
import { SolidBrushMeshChunk } from './solid_brush_mesh_chunk.js';
import { SolidBrushMeshRange, SolidMeshUpdateRange } from './solid_brush_mesh_range.js';
import { SolidMeshChunkCache } from './solid_mesh_chunk_cache.js';

/**
 * Combined solid result mesh with per-brush ranges so live edits patch only
 * dirty slices instead of reallocating and rewriting the entire map.
 */
export class SolidResultBuffer {
  private positions = new Float32Array(0);
  private normals = new Float32Array(0);
  private uvs = new Float32Array(0);
  private ranges: SolidBrushMeshRange[] = [];
  private readonly rangeByBrushId = new Map<string, SolidBrushMeshRange>();
  private surfaceRegions: SolidSurfaceRegion[] = [];
  private triangleSources: SolidTriangleSource[] = [];
  private lastBrushOrder: string[] = [];
  private lastUpdateRanges: SolidMeshUpdateRange[] = [];
  private partialWrite = false;

  /** Clears all buffers and ranges. */
  clear(): void {
    this.positions = new Float32Array(0);
    this.normals = new Float32Array(0);
    this.uvs = new Float32Array(0);
    this.ranges = [];
    this.rangeByBrushId.clear();
    this.surfaceRegions = [];
    this.triangleSources = [];
    this.lastBrushOrder = [];
    this.lastUpdateRanges = [];
    this.partialWrite = false;
  }

  /**
   * Returns surface regions with global triangle indices.
   *
   * @returns Region list.
   */
  getSurfaceRegions(): SolidSurfaceRegion[] {
    return this.surfaceRegions;
  }

  /**
   * Returns per-triangle brush sources.
   *
   * @returns Source list.
   */
  getTriangleSources(): SolidTriangleSource[] {
    return this.triangleSources;
  }

  /**
   * Returns a new array of the current per-triangle sources.
   *
   * @returns Source list copy.
   */
  snapshotTriangleSources(): SolidTriangleSource[] {
    return this.triangleSources.slice();
  }

  /**
   * Returns update ranges from the last partial patch.
   *
   * @returns GPU update windows.
   */
  getLastUpdateRanges(): SolidMeshUpdateRange[] {
    return this.lastUpdateRanges.slice();
  }

  /**
   * Returns whether the last write was a partial patch.
   *
   * @returns True after a successful tryPatchDirty.
   */
  wasLastWritePartial(): boolean {
    return this.partialWrite;
  }

  /**
   * Fully rebuilds buffers from every chunk in brush order.
   *
   * @param brushIds Evaluation order.
   * @param chunkCache Per-brush chunks.
   */
  rebuildFull(brushIds: readonly string[], chunkCache: SolidMeshChunkCache): void {
    const chunks = this.collectOrderedChunks(brushIds, chunkCache);
    const vertexCount = this.sumVertexCount(chunks);
    this.allocateExact(vertexCount);
    this.resetLayoutCollections();
    let vertexOffset = 0;
    let triangleOffset = 0;
    for (const entry of chunks) {
      this.writeChunkAt(entry.chunk, vertexOffset);
      this.recordRange(entry.brushId, vertexOffset, entry.chunk, triangleOffset);
      this.appendRegions(entry.chunk, triangleOffset);
      vertexOffset += entry.chunk.vertexCount;
      triangleOffset += entry.chunk.triangleCount;
    }
    this.lastBrushOrder = brushIds.slice();
    this.lastUpdateRanges = [];
    this.partialWrite = false;
  }

  /**
   * Patches dirty brush slices when every dirty brush keeps its vertex count.
   *
   * @param dirtyBrushIds Brushes whose chunks were rebuilt.
   * @param brushIds Current evaluation order.
   * @param chunkCache Per-brush chunks.
   * @returns True when patching succeeded; false when a full rebuild is
   *   required.
   */
  tryPatchDirty(
    dirtyBrushIds: readonly string[],
    brushIds: readonly string[],
    chunkCache: SolidMeshChunkCache,
  ): boolean {
    if (!this.canPatchDirty(dirtyBrushIds, brushIds, chunkCache)) {
      return false;
    }
    const updateRanges: SolidMeshUpdateRange[] = [];
    for (const brushId of dirtyBrushIds) {
      this.patchOneDirtyBrushIfPresent(brushId, chunkCache, updateRanges);
    }
    this.lastUpdateRanges = updateRanges;
    this.partialWrite = true;
    return true;
  }

  /**
   * Writes one dirty brush into its existing range when it still contributes
   * geometry. Empty free-floating cutters (no range / zero triangles) are a
   * no-op so they do not force a full map rewrite.
   *
   * @param brushId Dirty brush id.
   * @param chunkCache Mesh chunk cache.
   * @param updateRanges Accumulator for GPU update windows.
   */
  private patchOneDirtyBrushIfPresent(
    brushId: string,
    chunkCache: SolidMeshChunkCache,
    updateRanges: SolidMeshUpdateRange[],
  ): void {
    const range = this.rangeByBrushId.get(brushId);
    const chunk = chunkCache.get(brushId);
    if (!range || !chunk || chunk.triangleCount === 0 || range.triangleCount === 0) {
      return;
    }
    this.writeChunkAt(chunk, range.vertexStart);
    this.replaceBrushRegions(range, chunk);
    updateRanges.push(this.makeUpdateRange(range));
  }

  /**
   * Rebuilds from the first size-changing brush onward, keeping a stable
   * prefix. The prefix is copied from the previous buffer for speed; dirty
   * brushes that landed in that prefix (same triangle counts, only pose change)
   * are then rewritten from the chunk cache so a moved seed cannot stay behind
   * peers that forced a later topology rebuild.
   *
   * @param dirtyBrushIds Brushes recompiled this pass.
   * @param brushIds Current evaluation order.
   * @param chunkCache Per-brush chunks.
   * @returns True when a prefix-preserving rebuild succeeded.
   */
  tryRebuildFromFirstChanged(
    dirtyBrushIds: readonly string[],
    brushIds: readonly string[],
    chunkCache: SolidMeshChunkCache,
  ): boolean {
    if (this.ranges.length === 0) return false;
    const layoutOrder = this.resolveLayoutOrderForRebuild(brushIds);
    if (!layoutOrder) return false;
    const firstChangedOrderIndex = this.findFirstLayoutChangeOrderIndex(dirtyBrushIds, layoutOrder, chunkCache);
    if (firstChangedOrderIndex < 0) return false;
    if (firstChangedOrderIndex === 0) return false;
    const prefixBrushIds = layoutOrder.slice(0, firstChangedOrderIndex);
    const suffixBrushIds = layoutOrder.slice(firstChangedOrderIndex);
    const prefixVertexEnd = this.vertexEndAfterBrushes(prefixBrushIds);
    const prefixTriangleEnd = this.triangleEndAfterBrushes(prefixBrushIds);
    const suffixChunks = this.collectOrderedChunks(suffixBrushIds, chunkCache);
    const suffixVertexCount = this.sumVertexCount(suffixChunks);
    const newVertexCount = prefixVertexEnd + suffixVertexCount;
    const nextPositions = new Float32Array(newVertexCount * 3);
    const nextNormals = new Float32Array(newVertexCount * 3);
    const nextUvs = new Float32Array(newVertexCount * 2);
    nextPositions.set(this.positions.subarray(0, prefixVertexEnd * 3));
    nextNormals.set(this.normals.subarray(0, prefixVertexEnd * 3));
    nextUvs.set(this.uvs.subarray(0, prefixVertexEnd * 2));
    this.positions = nextPositions;
    this.normals = nextNormals;
    this.uvs = nextUvs;
    this.trimLayoutToPrefix(prefixBrushIds, prefixTriangleEnd);
    let vertexOffset = prefixVertexEnd;
    let triangleOffset = prefixTriangleEnd;
    for (const entry of suffixChunks) {
      this.writeChunkAt(entry.chunk, vertexOffset);
      this.recordRange(entry.brushId, vertexOffset, entry.chunk, triangleOffset);
      this.appendRegions(entry.chunk, triangleOffset);
      vertexOffset += entry.chunk.vertexCount;
      triangleOffset += entry.chunk.triangleCount;
    }
    this.rewriteDirtyBrushesInPrefix(dirtyBrushIds, prefixVertexEnd, chunkCache);
    this.lastBrushOrder = layoutOrder.slice();
    this.lastUpdateRanges = [
      {
        positionFloatStart: prefixVertexEnd * 3,
        positionFloatCount: suffixVertexCount * 3,
        uvFloatStart: prefixVertexEnd * 2,
        uvFloatCount: suffixVertexCount * 2,
      },
    ];
    this.partialWrite = false;
    return true;
  }

  /**
   * Overwrites dirty brush slices that remained in the copied prefix with
   * current chunk data. Prefix dirty brushes kept their ranges (same size) so a
   * pose-only seed update is applied without rewriting the whole map.
   *
   * @param dirtyBrushIds Brushes recompiled this pass.
   * @param prefixVertexEnd Exclusive end of the stable prefix in vertices.
   * @param chunkCache Per-brush chunks.
   */
  private rewriteDirtyBrushesInPrefix(
    dirtyBrushIds: readonly string[],
    prefixVertexEnd: number,
    chunkCache: SolidMeshChunkCache,
  ): void {
    const unusedRanges: SolidMeshUpdateRange[] = [];
    for (const brushId of dirtyBrushIds) {
      const range = this.rangeByBrushId.get(brushId);
      if (!range) {
        continue;
      }
      if (range.vertexStart + range.vertexCount > prefixVertexEnd) {
        continue;
      }
      this.patchOneDirtyBrushIfPresent(brushId, chunkCache, unusedRanges);
    }
  }

  /**
   * Uploads buffer contents onto a Three.js geometry. Prefers shared arrays and
   * partial update ranges after patches.
   *
   * @param geometry Target buffer geometry.
   */
  uploadToGeometry(geometry: THREE.BufferGeometry): void {
    const vertexCount = this.positions.length / 3;
    if (vertexCount === 0) {
      this.writeEmptyAttributes(geometry);
      invalidateFacePickAcceleration(geometry);
      return;
    }
    if (this.tryUploadSharedOrInPlace(geometry, vertexCount)) {
      this.refreshGeometryBounds(geometry);
      invalidateFacePickAcceleration(geometry);
      return;
    }
    this.bindFreshAttributes(geometry);
    this.refreshGeometryBounds(geometry);
    invalidateFacePickAcceleration(geometry);
  }

  /**
   * Full (non-partial) upload of the current buffers. Clears partial-write
   * state and update ranges so the GPU receives the entire position, normal,
   * and UV arrays. Used after non-live commits where a partial range can leave
   * the solid surface visually frozen while CPU buffers already moved.
   *
   * @param geometry Target buffer geometry.
   */
  uploadToGeometryFull(geometry: THREE.BufferGeometry): void {
    this.partialWrite = false;
    this.lastUpdateRanges = [];
    this.uploadToGeometry(geometry);
  }

  /**
   * Recomputes bounds; uses a cheap dirty-range expansion after partial
   * patches.
   *
   * @param geometry Target geometry.
   */
  private refreshGeometryBounds(geometry: THREE.BufferGeometry): void {
    if (this.partialWrite && this.lastUpdateRanges.length > 0) {
      this.expandBoundsFromUpdateRanges(geometry);
      return;
    }
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
  }

  /**
   * Expands existing geometry bounds using only dirty vertex windows.
   *
   * @param geometry Target geometry with position attribute.
   */
  private expandBoundsFromUpdateRanges(geometry: THREE.BufferGeometry): void {
    const position = geometry.getAttribute('position');
    if (!position) return;
    if (!geometry.boundingBox) {
      geometry.computeBoundingBox();
    }
    if (!geometry.boundingSphere) {
      geometry.computeBoundingSphere();
    }
    const box = geometry.boundingBox ?? new THREE.Box3();
    const sphere = geometry.boundingSphere ?? new THREE.Sphere();
    const point = new THREE.Vector3();
    for (const range of this.lastUpdateRanges) {
      const vertexStart = range.positionFloatStart / 3;
      const vertexEnd = vertexStart + range.positionFloatCount / 3;
      for (let vertex = vertexStart; vertex < vertexEnd; vertex++) {
        point.fromBufferAttribute(position, vertex);
        box.expandByPoint(point);
        sphere.expandByPoint(point);
      }
    }
    geometry.boundingBox = box;
    geometry.boundingSphere = sphere;
  }

  /**
   * Returns whether dirty brushes can be patched without rebuilding the layout.
   * Evaluation order may differ from the stored mesh layout order; only the
   * brush set and per-dirty vertex/triangle sizes must match so CSG reorder (To
   * First / To Last) can patch without rewriting the whole map.
   *
   * @param dirtyBrushIds Dirty brush ids.
   * @param brushIds Current evaluation order.
   * @param chunkCache Chunk cache.
   * @returns True when layout is stable for in-place patch.
   */
  private canPatchDirty(
    dirtyBrushIds: readonly string[],
    brushIds: readonly string[],
    chunkCache: SolidMeshChunkCache,
  ): boolean {
    if (this.ranges.length === 0) return false;
    if (!this.sameBrushSet(brushIds)) return false;
    for (const brushId of dirtyBrushIds) {
      if (!this.dirtyBrushFitsRange(brushId, chunkCache)) return false;
    }
    return true;
  }

  /**
   * Finds the earliest brush order index that must rebuild because size changed
   * or the brush is dirty with a missing prior range.
   *
   * @param dirtyBrushIds Dirty brush ids.
   * @param brushIds Evaluation order.
   * @param chunkCache Chunk cache.
   * @returns Order index, or -1 when nothing changed size.
   */
  private findFirstLayoutChangeOrderIndex(
    dirtyBrushIds: readonly string[],
    brushIds: readonly string[],
    chunkCache: SolidMeshChunkCache,
  ): number {
    const dirtySet = new Set(dirtyBrushIds);
    for (let orderIndex = 0; orderIndex < brushIds.length; orderIndex++) {
      const brushId = brushIds[orderIndex]!;
      const chunk = chunkCache.get(brushId);
      const range = this.rangeByBrushId.get(brushId);
      if (!chunk || chunk.triangleCount === 0) {
        if (range && range.triangleCount > 0) return orderIndex;
        continue;
      }
      if (!range) {
        if (dirtySet.has(brushId)) return orderIndex;
        return orderIndex;
      }
      if (chunk.vertexCount !== range.vertexCount || chunk.triangleCount !== range.triangleCount) {
        return orderIndex;
      }
    }
    return -1;
  }

  /**
   * Returns the vertex end index after the listed prefix brushes.
   *
   * @param prefixBrushIds Brush ids that remain stable.
   * @returns Vertex count of the prefix.
   */
  private vertexEndAfterBrushes(prefixBrushIds: readonly string[]): number {
    for (let index = prefixBrushIds.length - 1; index >= 0; index--) {
      const range = this.rangeByBrushId.get(prefixBrushIds[index]!);
      if (range) return range.vertexStart + range.vertexCount;
    }
    return 0;
  }

  /**
   * Returns the triangle end index after the listed prefix brushes.
   *
   * @param prefixBrushIds Brush ids that remain stable.
   * @returns Triangle count of the prefix.
   */
  private triangleEndAfterBrushes(prefixBrushIds: readonly string[]): number {
    for (let index = prefixBrushIds.length - 1; index >= 0; index--) {
      const range = this.rangeByBrushId.get(prefixBrushIds[index]!);
      if (range) return range.triangleStart + range.triangleCount;
    }
    return 0;
  }

  /**
   * Drops range/region/source data for brushes after the stable prefix.
   *
   * @param prefixBrushIds Brush ids to keep.
   * @param prefixTriangleEnd Triangle count of the prefix.
   */
  private trimLayoutToPrefix(prefixBrushIds: readonly string[], prefixTriangleEnd: number): void {
    const keep = new Set(prefixBrushIds);
    this.ranges = this.ranges.filter((range) => keep.has(range.brushId));
    this.rangeByBrushId.clear();
    for (const range of this.ranges) {
      this.rangeByBrushId.set(range.brushId, range);
    }
    this.surfaceRegions = this.surfaceRegions.filter((region) => keep.has(region.brushId));
    this.triangleSources = this.triangleSources.slice(0, prefixTriangleEnd);
  }

  /**
   * Returns whether one dirty brush still fits its stored range. Brushes that
   * contribute no triangles (free-floating subtractive/intersect) fit when they
   * also have no stored range or a zero-sized range.
   *
   * @param brushId Brush id.
   * @param chunkCache Chunk cache.
   * @returns True when vertex and triangle counts match, or both sides empty.
   */
  private dirtyBrushFitsRange(brushId: string, chunkCache: SolidMeshChunkCache): boolean {
    const range = this.rangeByBrushId.get(brushId);
    const chunk = chunkCache.get(brushId);
    if (this.chunkContributesNoGeometry(chunk)) {
      return this.rangeContributesNoGeometry(range);
    }
    if (!range || !chunk) {
      return false;
    }
    return chunk.vertexCount === range.vertexCount && chunk.triangleCount === range.triangleCount;
  }

  /**
   * Returns whether a chunk is missing or has no triangles.
   *
   * @param chunk Mesh chunk or undefined.
   * @returns True when the brush adds no result geometry.
   */
  private chunkContributesNoGeometry(chunk: SolidBrushMeshChunk | undefined): boolean {
    return !chunk || chunk.triangleCount === 0 || chunk.vertexCount === 0;
  }

  /**
   * Returns whether a stored range is missing or has no triangles.
   *
   * @param range Brush mesh range or undefined.
   * @returns True when the brush has no layout slice.
   */
  private rangeContributesNoGeometry(range: SolidBrushMeshRange | undefined): boolean {
    return !range || range.triangleCount === 0 || range.vertexCount === 0;
  }

  /**
   * Returns whether brush order matches the last full layout.
   *
   * @param brushIds Candidate order.
   * @returns True when identical.
   */
  private orderMatches(brushIds: readonly string[]): boolean {
    if (brushIds.length !== this.lastBrushOrder.length) return false;
    for (let index = 0; index < brushIds.length; index++) {
      if (brushIds[index] !== this.lastBrushOrder[index]) return false;
    }
    return true;
  }

  /**
   * Returns whether the candidate evaluation list is the same brush set as the
   * last mesh layout (order may differ).
   *
   * @param brushIds Candidate evaluation order.
   * @returns True when membership matches the stored layout set.
   */
  private sameBrushSet(brushIds: readonly string[]): boolean {
    if (brushIds.length !== this.lastBrushOrder.length) return false;
    if (this.orderMatches(brushIds)) return true;
    const layoutSet = new Set(this.lastBrushOrder);
    for (const brushId of brushIds) {
      if (!layoutSet.has(brushId)) return false;
    }
    return true;
  }

  /**
   * Picks the brush order used for mesh layout rebuilds. Prefers evaluation
   * order when it matches the stored layout; otherwise keeps the stored layout
   * when only CSG evaluation order changed.
   *
   * @param brushIds Current evaluation order.
   * @returns Layout order, or null when the brush set changed.
   */
  private resolveLayoutOrderForRebuild(brushIds: readonly string[]): string[] | null {
    if (this.orderMatches(brushIds)) {
      return brushIds.slice();
    }
    if (!this.sameBrushSet(brushIds)) {
      return null;
    }
    return this.lastBrushOrder.slice();
  }

  /**
   * Collects non-empty chunks with their brush ids.
   *
   * @param brushIds Order.
   * @param chunkCache Cache.
   * @returns Ordered chunk entries.
   */
  private collectOrderedChunks(
    brushIds: readonly string[],
    chunkCache: SolidMeshChunkCache,
  ): Array<{ brushId: string; chunk: SolidBrushMeshChunk }> {
    const result: Array<{ brushId: string; chunk: SolidBrushMeshChunk }> = [];
    for (const brushId of brushIds) {
      const chunk = chunkCache.get(brushId);
      if (!chunk || chunk.triangleCount === 0) continue;
      result.push({ brushId, chunk });
    }
    return result;
  }

  /**
   * Sums vertex counts across chunk entries.
   *
   * @param chunks Chunk entries.
   * @returns Total vertex count.
   */
  private sumVertexCount(chunks: Array<{ chunk: SolidBrushMeshChunk }>): number {
    let vertexCount = 0;
    for (const entry of chunks) {
      vertexCount += entry.chunk.vertexCount;
    }
    return vertexCount;
  }

  /**
   * Allocates exact-sized internal typed arrays.
   *
   * @param vertexCount Required vertices.
   */
  private allocateExact(vertexCount: number): void {
    this.positions = new Float32Array(vertexCount * 3);
    this.normals = new Float32Array(vertexCount * 3);
    this.uvs = new Float32Array(vertexCount * 2);
  }

  /** Resets range and region collections before a full rebuild. */
  private resetLayoutCollections(): void {
    this.ranges = [];
    this.rangeByBrushId.clear();
    this.surfaceRegions = [];
    this.triangleSources = [];
  }

  /**
   * Copies one chunk into the combined buffers at a vertex offset.
   *
   * @param chunk Source chunk.
   * @param vertexOffset Destination vertex start.
   */
  private writeChunkAt(chunk: SolidBrushMeshChunk, vertexOffset: number): void {
    this.positions.set(chunk.positions, vertexOffset * 3);
    this.normals.set(chunk.normals, vertexOffset * 3);
    this.uvs.set(chunk.uvs, vertexOffset * 2);
  }

  /**
   * Records a brush range after writing its chunk.
   *
   * @param brushId Brush id.
   * @param vertexOffset Vertex start.
   * @param chunk Written chunk.
   * @param triangleOffset Triangle start.
   */
  private recordRange(brushId: string, vertexOffset: number, chunk: SolidBrushMeshChunk, triangleOffset: number): void {
    const range: SolidBrushMeshRange = {
      brushId,
      vertexStart: vertexOffset,
      vertexCount: chunk.vertexCount,
      triangleStart: triangleOffset,
      triangleCount: chunk.triangleCount,
    };
    this.ranges.push(range);
    this.rangeByBrushId.set(brushId, range);
  }

  /**
   * Builds a GPU update range for a brush range.
   *
   * @param range Brush range.
   * @returns Update range.
   */
  private makeUpdateRange(range: SolidBrushMeshRange): SolidMeshUpdateRange {
    return {
      positionFloatStart: range.vertexStart * 3,
      positionFloatCount: range.vertexCount * 3,
      uvFloatStart: range.vertexStart * 2,
      uvFloatCount: range.vertexCount * 2,
    };
  }

  /**
   * Appends chunk regions/sources with a global triangle offset.
   *
   * @param chunk Source chunk.
   * @param triangleOffset Global triangle base.
   */
  private appendRegions(chunk: SolidBrushMeshChunk, triangleOffset: number): void {
    for (const region of chunk.regions) {
      this.surfaceRegions.push({
        triangleIndices: region.triangleIndices.map((localIndex) => localIndex + triangleOffset),
        textureId: region.textureId,
        brushId: region.brushId,
        surfaceIndex: region.surfaceIndex,
      });
    }
    for (const source of chunk.triangleSources) {
      this.triangleSources.push(source);
    }
  }

  /**
   * Replaces region and triangle-source entries for one patched brush.
   *
   * @param range Brush range in the combined mesh.
   * @param chunk Updated chunk.
   */
  private replaceBrushRegions(range: SolidBrushMeshRange, chunk: SolidBrushMeshChunk): void {
    this.removeSurfaceRegionsForBrush(range.brushId);
    this.triangleSources.splice(range.triangleStart, range.triangleCount, ...chunk.triangleSources);
    for (const region of chunk.regions) {
      this.surfaceRegions.push({
        triangleIndices: region.triangleIndices.map((localIndex) => localIndex + range.triangleStart),
        textureId: region.textureId,
        brushId: region.brushId,
        surfaceIndex: region.surfaceIndex,
      });
    }
  }

  /**
   * Removes surface regions belonging to one brush without reallocating when
   * none match (common for clean peers during partial patch of another brush).
   *
   * @param brushId Brush id to drop regions for.
   */
  private removeSurfaceRegionsForBrush(brushId: string): void {
    let writeIndex = 0;
    for (let readIndex = 0; readIndex < this.surfaceRegions.length; readIndex++) {
      const region = this.surfaceRegions[readIndex]!;
      if (region.brushId === brushId) continue;
      this.surfaceRegions[writeIndex] = region;
      writeIndex += 1;
    }
    this.surfaceRegions.length = writeIndex;
  }

  /**
   * Uploads using shared arrays or copies into existing attributes.
   *
   * @param geometry Target geometry.
   * @param vertexCount Combined vertex count.
   * @returns True when upload finished without rebinding attributes.
   */
  private tryUploadSharedOrInPlace(geometry: THREE.BufferGeometry, vertexCount: number): boolean {
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const uv = geometry.getAttribute('uv');
    if (!position || !normal || !uv) return false;
    if (position.count !== vertexCount) return false;
    if (position.array === this.positions) {
      this.markAttributesDirty(position, normal, uv);
      return true;
    }
    if (!(position.array instanceof Float32Array)) return false;
    if (!(normal.array instanceof Float32Array)) return false;
    if (!(uv.array instanceof Float32Array)) return false;
    this.copyBuffersIntoAttributes(position, normal, uv);
    this.markAttributesDirty(position, normal, uv);
    return true;
  }

  /**
   * Copies internal buffers into attribute arrays (full or dirty ranges only).
   *
   * @param position Position attribute.
   * @param normal Normal attribute.
   * @param uv UV attribute.
   */
  private copyBuffersIntoAttributes(
    position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
    normal: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
    uv: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  ): void {
    const posArray = position.array as Float32Array;
    const normArray = normal.array as Float32Array;
    const uvArray = uv.array as Float32Array;
    if (!this.partialWrite || this.lastUpdateRanges.length === 0) {
      posArray.set(this.positions);
      normArray.set(this.normals);
      uvArray.set(this.uvs);
      return;
    }
    for (const range of this.lastUpdateRanges) {
      posArray.set(
        this.positions.subarray(range.positionFloatStart, range.positionFloatStart + range.positionFloatCount),
        range.positionFloatStart,
      );
      normArray.set(
        this.normals.subarray(range.positionFloatStart, range.positionFloatStart + range.positionFloatCount),
        range.positionFloatStart,
      );
      uvArray.set(this.uvs.subarray(range.uvFloatStart, range.uvFloatStart + range.uvFloatCount), range.uvFloatStart);
    }
  }

  /**
   * Marks attributes dirty, using partial update ranges after patches.
   *
   * @param position Position attribute.
   * @param normal Normal attribute.
   * @param uv UV attribute.
   */
  private markAttributesDirty(
    position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
    normal: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
    uv: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  ): void {
    if (!this.partialWrite || this.lastUpdateRanges.length === 0) {
      position.needsUpdate = true;
      normal.needsUpdate = true;
      uv.needsUpdate = true;
      return;
    }
    this.clearUpdateRanges(position);
    this.clearUpdateRanges(normal);
    this.clearUpdateRanges(uv);
    for (const range of this.lastUpdateRanges) {
      this.addUpdateRange(position, range.positionFloatStart, range.positionFloatCount);
      this.addUpdateRange(normal, range.positionFloatStart, range.positionFloatCount);
      this.addUpdateRange(uv, range.uvFloatStart, range.uvFloatCount);
    }
    position.needsUpdate = true;
    normal.needsUpdate = true;
    uv.needsUpdate = true;
  }

  /**
   * Clears prior update ranges on a buffer attribute when supported.
   *
   * @param attribute Geometry attribute.
   */
  private clearUpdateRanges(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): void {
    const buffered = attribute as THREE.BufferAttribute & {
      clearUpdateRanges?: () => void;
    };
    buffered.clearUpdateRanges?.();
  }

  /**
   * Adds one update range when the Three.js API is available.
   *
   * @param attribute Geometry attribute.
   * @param start Float start index.
   * @param count Float count.
   */
  private addUpdateRange(
    attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
    start: number,
    count: number,
  ): void {
    const buffered = attribute as THREE.BufferAttribute & {
      addUpdateRange?: (start: number, count: number) => void;
    };
    buffered.addUpdateRange?.(start, count);
  }

  /**
   * Binds internal arrays as geometry attributes (shared, no copy).
   *
   * @param geometry Target geometry.
   */
  private bindFreshAttributes(geometry: THREE.BufferGeometry): void {
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(this.normals, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(this.uvs, 2));
  }

  /**
   * Writes empty attributes when the solid has no triangles.
   *
   * @param geometry Target geometry.
   */
  private writeEmptyAttributes(geometry: THREE.BufferGeometry): void {
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(0), 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(0), 2));
  }
}
