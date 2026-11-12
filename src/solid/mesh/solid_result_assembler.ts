import { SolidSurfaceRegion, SolidTriangleSource } from '@/solid/algorithm/surface/surface_triangulator.js';
import { SolidBrushMeshChunk } from './solid_brush_mesh_chunk.js';
import { SolidMeshChunkCache } from './solid_mesh_chunk_cache.js';

/** Assembled non-indexed mesh buffers ready to upload to a result mesh. */
export interface SolidAssembledMesh {
  /** Concatenated positions. */
  positions: Float32Array;
  /** Concatenated normals. */
  normals: Float32Array;
  /** Concatenated UVs. */
  uvs: Float32Array;
  /** Total triangle count. */
  triangleCount: number;
  /** Surface regions with global triangle indices. */
  surfaceRegions: SolidSurfaceRegion[];
  /** Per-triangle sources with global ordering. */
  triangleSources: SolidTriangleSource[];
}

/**
 * Concatenates per-brush mesh chunks into final result buffers. Only copies
 * typed arrays; does not retriangulate or rebake UVs.
 */
export class SolidResultAssembler {
  /**
   * Assembles cached chunks in brush tree order into one mesh payload.
   *
   * @param brushIds Visible brush ids in evaluation order.
   * @param chunkCache Per-brush chunk cache.
   * @returns Assembled mesh buffers, or empty payload when nothing is present.
   */
  static assemble(brushIds: readonly string[], chunkCache: SolidMeshChunkCache): SolidAssembledMesh {
    const chunks = this.collectChunks(brushIds, chunkCache);
    if (chunks.length === 0) {
      return this.emptyMesh();
    }
    const totals = this.measureChunks(chunks);
    const positions = new Float32Array(totals.vertexCount * 3);
    const normals = new Float32Array(totals.vertexCount * 3);
    const uvs = new Float32Array(totals.vertexCount * 2);
    const surfaceRegions: SolidSurfaceRegion[] = [];
    const triangleSources: SolidTriangleSource[] = [];
    let vertexOffset = 0;
    let triangleOffset = 0;
    for (const chunk of chunks) {
      positions.set(chunk.positions, vertexOffset * 3);
      normals.set(chunk.normals, vertexOffset * 3);
      uvs.set(chunk.uvs, vertexOffset * 2);
      this.appendRegions(chunk, triangleOffset, surfaceRegions, triangleSources);
      vertexOffset += chunk.vertexCount;
      triangleOffset += chunk.triangleCount;
    }
    return {
      positions,
      normals,
      uvs,
      triangleCount: totals.triangleCount,
      surfaceRegions,
      triangleSources,
    };
  }

  /**
   * Collects chunks for the given brush order, skipping missing empties.
   *
   * @param brushIds Brush ids.
   * @param chunkCache Chunk cache.
   * @returns Present chunks in order.
   */
  private static collectChunks(brushIds: readonly string[], chunkCache: SolidMeshChunkCache): SolidBrushMeshChunk[] {
    const chunks: SolidBrushMeshChunk[] = [];
    for (const brushId of brushIds) {
      const chunk = chunkCache.get(brushId);
      if (chunk && chunk.triangleCount > 0) {
        chunks.push(chunk);
      }
    }
    return chunks;
  }

  /**
   * Sums vertex and triangle counts across chunks.
   *
   * @param chunks Chunk list.
   * @returns Totals.
   */
  private static measureChunks(chunks: SolidBrushMeshChunk[]): {
    vertexCount: number;
    triangleCount: number;
  } {
    let vertexCount = 0;
    let triangleCount = 0;
    for (const chunk of chunks) {
      vertexCount += chunk.vertexCount;
      triangleCount += chunk.triangleCount;
    }
    return { vertexCount, triangleCount };
  }

  /**
   * Appends chunk regions and sources with global triangle index offsets.
   *
   * @param chunk Source chunk.
   * @param triangleOffset Global triangle base index.
   * @param surfaceRegions Output regions.
   * @param triangleSources Output sources.
   */
  private static appendRegions(
    chunk: SolidBrushMeshChunk,
    triangleOffset: number,
    surfaceRegions: SolidSurfaceRegion[],
    triangleSources: SolidTriangleSource[],
  ): void {
    for (const region of chunk.regions) {
      surfaceRegions.push({
        triangleIndices: region.triangleIndices.map((localIndex) => localIndex + triangleOffset),
        ...(region.textureOverride ? { textureOverride: region.textureOverride } : {}),
        textureId: region.textureId,
        brushId: region.brushId,
        surfaceIndex: region.surfaceIndex,
      });
    }
    for (const source of chunk.triangleSources) {
      triangleSources.push(source);
    }
  }

  /**
   * Returns an empty assembled mesh payload.
   *
   * @returns Empty buffers.
   */
  private static emptyMesh(): SolidAssembledMesh {
    return {
      positions: new Float32Array(0),
      normals: new Float32Array(0),
      uvs: new Float32Array(0),
      triangleCount: 0,
      surfaceRegions: [],
      triangleSources: [],
    };
  }
}
