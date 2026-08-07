import * as THREE from 'three';
import type { SolidBrushInstance } from './solid_brush_instance.js';
import { SolidCsgCompiler } from '@/solid/algorithm/compile/solid_csg_compiler.js';
import type { SolidCompileOptions } from '@/solid/algorithm/compile/solid_compile_types.js';
import { SolidSurfaceRegion } from '@/solid/algorithm/surface/surface_triangulator.js';
import { SolidBrushMeshChunkBuilder } from '@/solid/mesh/solid_brush_mesh_chunk.js';
import { SolidMeshChunkCache } from '@/solid/mesh/solid_mesh_chunk_cache.js';
import { SolidResultBuffer } from '@/solid/mesh/solid_result_buffer.js';
import { createDefaultFaceSurface, type FaceSurfaceDescription } from '@/texture/uv_matrix/face_surface_description.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import type { FaceTextureMapping } from '@/texture/uv/face_texture_mapping.js';
import { forBatchesAsync } from '@/utils/async_yield.js';
import { SOLID_TRIANGLE_SOURCES_USERDATA_KEY } from './solid_model_keys.js';
import { stripStaleDecorativeEdges } from './solid_model_mesh_disposal.js';

/** Host accessors the rebuild pipeline needs from SolidModel. */
export type SolidRebuildHost = {
  getResultMesh: () => THREE.Mesh;
  findBrush: (id: string) => SolidBrushInstance | undefined;
  getEvaluationList: () => SolidBrushInstance[];
  syncBrushOrderFromScene: () => void;
};

/**
 * Owns CSG compile, mesh chunk cache, result buffer, and dirty tracking for a
 * solid model.
 */
export class SolidModelRebuildPipeline {
  private readonly compiler = new SolidCsgCompiler();
  private readonly meshChunkCache = new SolidMeshChunkCache();
  private readonly chunkBuilder = new SolidBrushMeshChunkBuilder();
  private readonly resultBuffer = new SolidResultBuffer();
  private dirty = true;
  private fullRebuildRequired = true;
  private readonly dirtyBrushIds = new Set<string>();
  private interactiveGeometryCurrent = false;
  private lastSurfaceRegions: SolidSurfaceRegion[] = [];
  private uvStickToBrush = true;
  private invertedWorld = false;
  private readonly scratchBrushMatrix = new THREE.Matrix4();
  private readonly scratchBrushQuaternion = new THREE.Quaternion();
  private readonly identityBrushMatrix = new THREE.Matrix4();

  /**
   * Creates a rebuild pipeline bound to host accessors.
   *
   * @param host Solid model accessors for mesh, brushes, and order sync.
   */
  constructor(private readonly host: SolidRebuildHost) {}

  /**
   * Returns whether the model is marked dirty.
   *
   * @returns Dirty flag.
   */
  isDirty(): boolean {
    return this.dirty;
  }

  /**
   * Returns whether a full rebuild is required.
   *
   * @returns Full rebuild flag.
   */
  isFullRebuildRequired(): boolean {
    return this.fullRebuildRequired;
  }

  /**
   * Returns the count of brushes pending partial recompile.
   *
   * @returns Dirty brush id count.
   */
  getDirtyBrushIdCount(): number {
    return this.dirtyBrushIds.size;
  }

  /**
   * Iterates dirty brush ids.
   *
   * @returns Iterable of dirty brush ids.
   */
  getDirtyBrushIds(): Iterable<string> {
    return this.dirtyBrushIds;
  }

  /**
   * Returns whether live rebuild already produced current result geometry.
   *
   * @returns Interactive geometry trust flag.
   */
  isInteractiveGeometryCurrent(): boolean {
    return this.interactiveGeometryCurrent;
  }

  /**
   * Sets whether interactive geometry is trusted current after a live rebuild.
   *
   * @param current Trust flag.
   */
  setInteractiveGeometryCurrent(current: boolean): void {
    this.interactiveGeometryCurrent = current;
  }

  /** Clears the top-level dirty flag after a successful rebuild path. */
  clearDirtyFlag(): void {
    this.dirty = false;
  }

  /**
   * Sets the top-level dirty flag without changing full/partial seeds.
   *
   * @param dirty Dirty flag value.
   */
  setDirtyFlag(dirty: boolean): void {
    this.dirty = dirty;
  }

  /**
   * Returns last assembled surface regions for presentation.
   *
   * @returns Surface region list.
   */
  getLastSurfaceRegions(): SolidSurfaceRegion[] {
    return this.lastSurfaceRegions;
  }

  /**
   * Returns whether solid result UVs stick to each brush (Tex Lock).
   *
   * @returns UV stick mode.
   */
  getUvStickToBrush(): boolean {
    return this.uvStickToBrush;
  }

  /**
   * Sets whether solid result UV bake sticks textures to each brush.
   *
   * @param enabled True for brush-local UV, false for world UV.
   * @param _brushIds Unused parameter.
   * @returns True when the mode value changed.
   */
  setUvStickToBrush(enabled: boolean, _brushIds: readonly string[] = []): boolean {
    if (this.uvStickToBrush === enabled) return false;
    this.uvStickToBrush = enabled;
    return true;
  }

  /** Marks the model for a full CSG rebuild of every brush. */
  markDirty(): void {
    this.dirty = true;
    this.fullRebuildRequired = true;
    this.dirtyBrushIds.clear();
    this.interactiveGeometryCurrent = false;
  }

  /**
   * Marks specific brushes dirty for a partial CSG rebuild.
   *
   * @param brushIds Brush instance ids that changed.
   */
  markBrushesDirty(brushIds: Iterable<string>): void {
    this.dirty = true;
    if (this.fullRebuildRequired) return;
    for (const brushId of brushIds) {
      this.dirtyBrushIds.add(brushId);
    }
  }

  /**
   * Returns the compiler last brush evaluation order.
   *
   * @returns Ordered brush ids from last compile.
   */
  getLastBrushOrder(): string[] {
    return this.compiler.getLastBrushOrder();
  }

  /**
   * Returns the parent-chain pose fingerprint cached at the last prepare for a
   * brush.
   *
   * @param brushId Brush instance id.
   * @returns Cached parent-chain key, or undefined when missing.
   */
  getPreparedParentChainPoseKey(brushId: string): string | undefined {
    return this.compiler.getPreparedParentChainPoseKey(brushId);
  }

  /**
   * Returns touch peer ids cached for a brush.
   *
   * @param brushId Brush id.
   * @returns Peer brush ids.
   */
  getCachedTouchPeerIds(brushId: string): string[] {
    return this.compiler.getCachedTouchPeerIds(brushId);
  }

  /** Clears CSG routing tables without dropping polygon caches. */
  clearRoutingTables(): void {
    this.compiler.clearRoutingTables();
  }

  /**
   * Invalidates compiler state for a removed brush without forcing a full map
   * rebuild. Mesh result ranges for other brushes stay intact until the next
   * assemble pass drops the missing id.
   *
   * @param brushId Removed brush id.
   */
  invalidateBrush(brushId: string): void {
    this.compiler.invalidateBrush(brushId);
    this.meshChunkCache.remove(brushId);
    this.dirty = true;
  }

  /**
   * Returns whether the last successful compile included this brush id.
   *
   * @param brushId Brush instance id.
   * @returns True when the brush was in the previous evaluation order.
   */
  compileOrderLastContainsBrush(brushId: string): boolean {
    return this.compiler.getLastBrushOrder().includes(brushId);
  }

  /**
   * Removes a brush mesh chunk when the brush is hidden.
   *
   * @param brushId Brush id.
   */
  removeMeshChunk(brushId: string): void {
    this.meshChunkCache.remove(brushId);
  }

  /**
   * Returns a copy of compile stats from the most recent CSG compile.
   *
   * @returns Full-rebuild flag and per-phase brush counts.
   */
  getCompilerStatsForTesting(): {
    fullRebuild: boolean;
    recompiledBrushCount: number;
    reusedBrushCount: number;
    preparedBrushCount: number;
  } {
    return this.compiler.getLastCompileStats();
  }

  /**
   * Exposes whether the last result mesh write was an in-place partial patch.
   *
   * @returns True after a successful dirty-range patch.
   */
  wasLastResultWritePartialForTesting(): boolean {
    return this.wasLastResultWritePartial();
  }

  /**
   * Returns whether the last result mesh write was an in-place partial patch.
   *
   * @returns True after a successful dirty-range patch.
   */
  wasLastResultWritePartial(): boolean {
    return this.resultBuffer.wasLastWritePartial();
  }

  /**
   * Pulls brush transforms, runs CSG, remeshes dirty brush chunks, and
   * assembles the result. When liveDrag is false and the last result write was
   * not a partial patch, forces a full geometry attribute upload.
   *
   * @param liveDrag When true, only pulls dirty brush transforms before
   *   compile; when false, syncs brush order and pulls every brush transform.
   */
  compileResultGeometry(liveDrag: boolean = false): void {
    this.syncBrushesBeforeCompile(liveDrag);
    this.compiler.compile(this.host.getEvaluationList(), this.buildCompileOptions());
    this.rebuildDirtyMeshChunks();
    this.assembleResultFromCompiler();
    if (!liveDrag && !this.resultBuffer.wasLastWritePartial()) {
      this.forceFullResultGeometryUpload();
    }
  }

  /**
   * Re-uploads the entire result buffer to the result mesh geometry without
   * partial update ranges (authoritative non-live path).
   */
  private forceFullResultGeometryUpload(): void {
    const resultMesh = this.host.getResultMesh();
    this.resultBuffer.uploadToGeometryFull(resultMesh.geometry);
    resultMesh.geometry.userData['solidMeshUpdateRanges'] = [];
  }

  /**
   * Asynchronously rebuilds dirty mesh chunks and assembles the result mesh.
   *
   * @param onChunkProgress Optional 0..1 progress callback for the chunk phase.
   */
  async finishAsyncAfterCompile(onChunkProgress?: (ratio: number) => void): Promise<void> {
    await this.rebuildDirtyMeshChunksAsync(onChunkProgress);
    this.assembleResultFromCompiler();
  }

  /**
   * Runs a full async CSG compile.
   *
   * @param onProgress Optional compile progress 0..1.
   */
  async compileFullAsync(onProgress?: (ratio: number) => void): Promise<void> {
    await this.compiler.compileAsync(
      this.host.getEvaluationList(),
      { forceFull: true, skipPolygonAssembly: true, invertedWorld: this.invertedWorld },
      onProgress,
    );
  }

  /**
   * Syncs cached polygon texture ids from the brush's face mappings.
   *
   * @param brushId Brush id.
   * @returns True when polygon cache exists and was updated.
   */
  updateBrushPolygonTextures(brushId: string): boolean {
    const brush = this.host.findBrush(brushId);
    if (!brush) return false;
    return this.compiler.updateCachedPolygonTextures(brushId, (surfaceIndex) =>
      brush.getSurfaceTextureId(surfaceIndex),
    );
  }

  /**
   * Rebuilds mesh chunks for specific brushes and patches the result mesh.
   *
   * @param brushIds Brushes whose chunks need UV rebake.
   */
  rebakeMeshChunksForBrushes(brushIds: Set<string>): void {
    if (brushIds.size === 0) return;
    const dirtyIds = this.rebuildChunksForBrushIds(brushIds);
    if (dirtyIds.length === 0) return;
    this.patchOrRebuildResult(dirtyIds);
  }

  /**
   * Remeshes dirty brush chunks and patches result for presentation-only
   * texture updates.
   *
   * @param remeshedBrushIds Brushes with updated polygon textures.
   * @returns True when remesh completed without falling back to full CSG.
   */
  remeshPresentationForBrushes(remeshedBrushIds: readonly string[]): boolean {
    const resultMesh = this.host.getResultMesh();
    resultMesh.updateMatrixWorld(true);
    const worldMatrix = resultMesh.matrixWorld;
    for (const brushId of remeshedBrushIds) {
      this.rebuildOneMeshChunk(brushId, worldMatrix);
    }
    const brushOrder = this.compiler.getLastBrushOrder();
    if (brushOrder.length === 0) return false;
    this.patchOrRebuildWithOrder(remeshedBrushIds, brushOrder);
    this.dirty = false;
    this.interactiveGeometryCurrent = true;
    return true;
  }

  /**
   * Writes UV editor changes on the result mesh back onto owning brush faces
   * and rebakes affected chunks.
   *
   * @param maps Result face texture maps.
   * @param sources Per-triangle solid sources.
   * @param writeEntry Callback applying one map entry to brush faces.
   */
  syncAuthoredMappingsFromMaps(
    maps: Array<{ triangleIndices: number[]; mapping: FaceTextureMapping }>,
    sources: Array<{ brushId: string; surfaceIndex: number }>,
    writeEntry: (
      triangleIndices: number[],
      mapping: FaceTextureMapping,
      sources: Array<{ brushId: string; surfaceIndex: number }>,
    ) => void,
  ): void {
    for (const entry of maps) {
      writeEntry(entry.triangleIndices, entry.mapping, sources);
    }
    const brushIds = this.collectBrushIdsFromMaps(maps, sources);
    this.rebakeMeshChunksForBrushes(brushIds);
  }

  /**
   * Returns whether the result mesh has triangle geometry.
   *
   * @returns True when a position attribute with vertices exists.
   */
  hasResultGeometry(): boolean {
    const position = this.host.getResultMesh().geometry.getAttribute('position');
    return !!position && position.count >= 3;
  }

  /** Keeps the compiled mesh at local identity under the solid model root. */
  resetResultLocalTransform(): void {
    const resultMesh = this.host.getResultMesh();
    resultMesh.position.set(0, 0, 0);
    resultMesh.rotation.set(0, 0, 0);
    resultMesh.scale.set(1, 1, 1);
  }

  /**
   * Syncs transforms into the compiler path before compile.
   *
   * @param liveDrag When true, only dirty brushes are pulled.
   */
  private syncBrushesBeforeCompile(liveDrag: boolean): void {
    if (!liveDrag) {
      this.host.syncBrushOrderFromScene();
      for (const brush of this.host.getEvaluationList()) {
        brush.pullTransformFromMesh();
      }
      return;
    }
    for (const brushId of this.dirtyBrushIds) {
      this.host.findBrush(brushId)?.pullTransformFromMesh();
    }
  }

  /** Assembles result buffer after compiler and chunk updates. */
  private assembleResultFromCompiler(): void {
    const brushOrder = this.compiler.getLastBrushOrder();
    this.meshChunkCache.pruneToIds(new Set(brushOrder));
    this.writeResultFromChunks(brushOrder);
    this.lastSurfaceRegions = this.resultBuffer.getSurfaceRegions();
    this.host.getResultMesh().userData[SOLID_TRIANGLE_SOURCES_USERDATA_KEY] = this.resultBuffer.getTriangleSources();
    this.clearDirtyTracking();
  }

  /**
   * Builds compiler options from the current dirty-tracking state.
   *
   * @returns Partial or full compile options.
   */
  private buildCompileOptions(): SolidCompileOptions {
    const options: SolidCompileOptions = {
      skipPolygonAssembly: true,
      invertedWorld: this.invertedWorld,
    };
    if (this.fullRebuildRequired) {
      options.forceFull = true;
    } else {
      options.dirtyBrushIds = Array.from(this.dirtyBrushIds);
    }
    const solidRoot = this.resolveSolidRoot();
    if (solidRoot) {
      options.solidRoot = solidRoot;
    }
    return options;
  }

  /**
   * Resolves the solid model root group for hierarchical CSG tree building.
   *
   * @returns Solid root object, or undefined when unavailable.
   */
  private resolveSolidRoot(): THREE.Object3D | undefined {
    const resultMesh = this.host.getResultMesh();
    const parent = resultMesh.parent;
    return parent ?? undefined;
  }

  /**
   * Returns whether CSG uses inverted-world mode.
   *
   * @returns True when the solid starts full.
   */
  isInvertedWorld(): boolean {
    return this.invertedWorld;
  }

  /**
   * Sets inverted-world mode and marks a full rebuild.
   *
   * @param enabled True when subtractive brushes should carve from a full
   *   world.
   */
  setInvertedWorld(enabled: boolean): void {
    if (this.invertedWorld === enabled) return;
    this.invertedWorld = enabled;
    this.markDirty();
  }

  /** Clears dirty flags after a successful compile. */
  private clearDirtyTracking(): void {
    this.fullRebuildRequired = false;
    this.dirtyBrushIds.clear();
  }

  /**
   * Patches dirty brush slices when layout is stable; otherwise rebuilds fully.
   *
   * @param brushOrder Visible brush ids in evaluation order.
   */
  private writeResultFromChunks(brushOrder: string[]): void {
    this.ensureMeshChunksForBrushOrder(brushOrder);
    const dirtyIds = this.compiler.getLastUpdateBrushIds();
    if (this.tryPatchDirtyResult(dirtyIds, brushOrder)) return;
    this.rebuildResultSuffixOrFull(dirtyIds, brushOrder);
  }

  /**
   * Attempts an in-place dirty patch of the result buffer.
   *
   * @param dirtyIds Dirty brush ids.
   * @param brushOrder Evaluation order.
   * @returns True when patch succeeded.
   */
  private tryPatchDirtyResult(dirtyIds: string[], brushOrder: string[]): boolean {
    const patched = this.resultBuffer.tryPatchDirty(dirtyIds, brushOrder, this.meshChunkCache);
    if (!patched) return false;
    this.uploadResultBufferToMesh(true);
    return true;
  }

  /**
   * Rebuilds from the first changed brush or fully when suffix rebuild fails.
   *
   * @param dirtyIds Dirty brush ids.
   * @param brushOrder Evaluation order.
   */
  private rebuildResultSuffixOrFull(dirtyIds: string[], brushOrder: string[]): void {
    const suffixRebuilt = this.resultBuffer.tryRebuildFromFirstChanged(dirtyIds, brushOrder, this.meshChunkCache);
    if (!suffixRebuilt) {
      this.resultBuffer.rebuildFull(brushOrder, this.meshChunkCache);
    }
    this.uploadResultBufferToMesh(false);
  }

  /**
   * Rebuilds any missing mesh chunks from cached CSG polygons.
   *
   * @param brushOrder Brush ids that must have chunks before assemble.
   */
  private ensureMeshChunksForBrushOrder(brushOrder: readonly string[]): void {
    const resultMesh = this.host.getResultMesh();
    resultMesh.updateMatrixWorld(true);
    const worldMatrix = resultMesh.matrixWorld;
    for (const brushId of brushOrder) {
      this.ensureOneMeshChunk(brushId, worldMatrix);
    }
  }

  /**
   * Ensures a single brush mesh chunk exists when polygons are cached.
   *
   * @param brushId Brush id.
   * @param worldMatrix Result mesh world matrix.
   */
  private ensureOneMeshChunk(brushId: string, worldMatrix: THREE.Matrix4): void {
    if (this.meshChunkCache.get(brushId)) return;
    if (!this.compiler.getCachedPolygons(brushId)) return;
    this.rebuildOneMeshChunk(brushId, worldMatrix);
  }

  /**
   * Uploads the segmented result buffer onto the result mesh geometry.
   *
   * @param preferInPlace When true, keep existing geometry object if possible.
   */
  private uploadResultBufferToMesh(preferInPlace: boolean): void {
    const resultMesh = this.host.getResultMesh();
    if (!preferInPlace) {
      stripStaleDecorativeEdges(resultMesh);
    }
    this.resultBuffer.uploadToGeometry(resultMesh.geometry);
    resultMesh.geometry.userData['solidMeshUpdateRanges'] = this.resultBuffer.wasLastWritePartial()
      ? this.resultBuffer.getLastUpdateRanges()
      : [];
  }

  /**
   * Rebuilds triangulated UV-baked mesh chunks for brushes recompiled this
   * pass.
   */
  private rebuildDirtyMeshChunks(): void {
    const resultMesh = this.host.getResultMesh();
    resultMesh.updateMatrixWorld(true);
    const worldMatrix = resultMesh.matrixWorld;
    for (const brushId of this.compiler.getLastUpdateBrushIds()) {
      this.rebuildOneMeshChunk(brushId, worldMatrix);
    }
  }

  /**
   * Rebuilds dirty mesh chunks in batches with browser yields.
   *
   * @param onProgress Optional 0..1 progress for the chunk phase.
   */
  private async rebuildDirtyMeshChunksAsync(onProgress?: (ratio: number) => void): Promise<void> {
    const resultMesh = this.host.getResultMesh();
    resultMesh.updateMatrixWorld(true);
    const worldMatrix = resultMesh.matrixWorld;
    const dirtyIds = this.compiler.getLastUpdateBrushIds();
    await forBatchesAsync(
      dirtyIds.length,
      20,
      (start, end) => {
        for (let index = start; index < end; index++) {
          this.rebuildOneMeshChunk(dirtyIds[index]!, worldMatrix);
        }
      },
      onProgress,
    );
  }

  /**
   * Rebuilds one brush mesh chunk from cached CSG polygons.
   *
   * @param brushId Brush instance id.
   * @param worldMatrix Result mesh world matrix for UV projection.
   */
  private rebuildOneMeshChunk(brushId: string, worldMatrix: THREE.Matrix4): void {
    const polygons = this.compiler.getCachedPolygons(brushId) ?? [];
    const brush = this.host.findBrush(brushId);
    const brushModelMatrix = this.composeBrushModelMatrix(brush);
    void worldMatrix;
    const surfaceByIndex = new Map<number, FaceSurfaceDescription>();
    const chunk = this.chunkBuilder.build(
      polygons,
      (surfaceIndex) => this.resolveBrushFaceSurfaceCached(brush, surfaceIndex, surfaceByIndex),
      {
        brushModelMatrix,
      },
    );
    this.meshChunkCache.set(brushId, chunk);
  }

  /**
   * Composes the brush local model matrix from stored transform.
   *
   * @param brush Brush instance or undefined.
   * @returns Model matrix.
   */
  private composeBrushModelMatrix(brush: SolidBrushInstance | undefined): THREE.Matrix4 {
    if (!brush) return this.identityBrushMatrix;
    this.scratchBrushQuaternion.setFromEuler(brush.rotation);
    return this.scratchBrushMatrix.compose(brush.position, this.scratchBrushQuaternion, brush.scale);
  }

  /**
   * Resolves a face surface (texture + UV matrix) for chunk UV bake, caching
   * per face for the current chunk so multi-polygon faces do not re-clone.
   *
   * @param brush Owning brush or undefined.
   * @param surfaceIndex Face index.
   * @param surfaceByIndex Per-chunk surface cache.
   * @returns Face surface description.
   */
  private resolveBrushFaceSurfaceCached(
    brush: SolidBrushInstance | undefined,
    surfaceIndex: number,
    surfaceByIndex: Map<number, FaceSurfaceDescription>,
  ): FaceSurfaceDescription {
    const cached = surfaceByIndex.get(surfaceIndex);
    if (cached) return cached;
    const surface = brush ? brush.getFaceSurface(surfaceIndex) : createDefaultFaceSurface(DEFAULT_CHECKER_TEXTURE_ID);
    surfaceByIndex.set(surfaceIndex, surface);
    return surface;
  }

  /**
   * Rebuilds chunks for brush ids that still have cached polygons.
   *
   * @param brushIds Candidate brush ids.
   * @returns Brush ids that were rebuilt.
   */
  private rebuildChunksForBrushIds(brushIds: Set<string>): string[] {
    const resultMesh = this.host.getResultMesh();
    resultMesh.updateMatrixWorld(true);
    const worldMatrix = resultMesh.matrixWorld;
    const dirtyIds: string[] = [];
    for (const brushId of brushIds) {
      if (!this.compiler.getCachedPolygons(brushId)) continue;
      this.rebuildOneMeshChunk(brushId, worldMatrix);
      dirtyIds.push(brushId);
    }
    return dirtyIds;
  }

  /**
   * Patches or fully rebuilds the result after UV rebake.
   *
   * @param dirtyIds Brush ids with rebuilt chunks.
   */
  private patchOrRebuildResult(dirtyIds: string[]): void {
    const order = this.compiler.getLastBrushOrder();
    if (dirtyIds.length === 0 || order.length === 0) return;
    this.ensureMeshChunksForBrushOrder(order);
    const patched = this.resultBuffer.tryPatchDirty(dirtyIds, order, this.meshChunkCache);
    if (!patched) {
      this.resultBuffer.rebuildFull(order, this.meshChunkCache);
    }
    this.uploadResultBufferToMesh(patched);
    this.lastSurfaceRegions = this.resultBuffer.getSurfaceRegions();
    this.host.getResultMesh().userData[SOLID_TRIANGLE_SOURCES_USERDATA_KEY] = this.resultBuffer.getTriangleSources();
  }

  /**
   * Patches or fully rebuilds using an explicit dirty list and order.
   *
   * @param remeshed Dirty brush ids.
   * @param brushOrder Evaluation order.
   */
  private patchOrRebuildWithOrder(remeshed: readonly string[], brushOrder: string[]): void {
    const patched = this.resultBuffer.tryPatchDirty(remeshed, brushOrder, this.meshChunkCache);
    if (!patched) {
      this.resultBuffer.rebuildFull(brushOrder, this.meshChunkCache);
      this.uploadResultBufferToMesh(false);
    } else {
      this.uploadResultBufferToMesh(true);
    }
    this.lastSurfaceRegions = this.resultBuffer.getSurfaceRegions();
    this.host.getResultMesh().userData[SOLID_TRIANGLE_SOURCES_USERDATA_KEY] = this.resultBuffer.getTriangleSources();
  }

  /**
   * Collects unique brush ids referenced by result face maps.
   *
   * @param maps Result face texture maps.
   * @param sources Per-triangle solid sources.
   * @returns Brush ids whose UV chunks should rebake.
   */
  private collectBrushIdsFromMaps(
    maps: Array<{ triangleIndices: number[] }>,
    sources: Array<{ brushId: string; surfaceIndex: number }>,
  ): Set<string> {
    const brushIds = new Set<string>();
    for (const entry of maps) {
      for (const triangleIndex of entry.triangleIndices) {
        const source = sources[triangleIndex];
        if (source?.brushId) brushIds.add(source.brushId);
      }
    }
    return brushIds;
  }
}
