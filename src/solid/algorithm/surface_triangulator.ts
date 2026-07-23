import * as THREE from 'three';
import { DEFAULT_CHECKER_TEXTURE_ID } from '../../texture/texture_id.js';

/**
 * One coplanar surface region with triangle indices and texture identity.
 */
export interface SolidSurfaceRegion {
  /** Triangle indices in the non-indexed mesh buffer. */
  triangleIndices: number[];
  /** Texture authored on the originating brush surface. */
  textureId: string;
  /** Originating brush instance id. */
  brushId: string;
  /** Originating brush face index. */
  surfaceIndex: number;
}

/**
 * Maps one result triangle back to its brush surface (for face-mode paint).
 */
export interface SolidTriangleSource {
  brushId: string;
  surfaceIndex: number;
  textureId: string;
}

/**
 * Fan-triangulates convex polygons into triangle index lists.
 */
export class SurfaceTriangulator {
  /**
   * Triangulates a convex polygon in vertex-array order.
   * @param vertexCount Number of vertices in the polygon.
   * @returns Triangle indices as flat [i0,i1,i2, ...] relative to the polygon.
   */
  static fanIndices(vertexCount: number): number[] {
    if (vertexCount < 3) return [];
    const indices: number[] = [];
    for (let index = 1; index < vertexCount - 1; index++) {
      indices.push(0, index, index + 1);
    }
    return indices;
  }

  /**
   * Builds interleaved position/normal arrays and per-face surface regions.
   * Each input polygon becomes one coplanar UV region (never merges cube sides).
   * @param polygons Polygons with vertices, normals, and optional texture ids.
   * @returns Buffer data, triangle count, texture ids, and coplanar regions.
   */
  static buildMeshArrays(
    polygons: Array<{
      vertices: THREE.Vector3[];
      normal: THREE.Vector3;
      textureId?: string;
      brushId?: string;
      surfaceIndex?: number;
    }>
  ): {
    positions: Float32Array;
    normals: Float32Array;
    triangleCount: number;
    triangleTextureIds: string[];
    surfaceRegions: SolidSurfaceRegion[];
    triangleSources: SolidTriangleSource[];
  } {
    const positionList: number[] = [];
    const normalList: number[] = [];
    const triangleTextureIds: string[] = [];
    const surfaceRegions: SolidSurfaceRegion[] = [];
    const triangleSources: SolidTriangleSource[] = [];
    let triangleCount = 0;
    for (const polygon of polygons) {
      const localIndices = this.fanIndices(polygon.vertices.length);
      const triangleSteps = localIndices.length / 3;
      if (triangleSteps < 1) continue;
      const textureId = polygon.textureId || DEFAULT_CHECKER_TEXTURE_ID;
      const brushId = polygon.brushId || '';
      const surfaceIndex = polygon.surfaceIndex ?? 0;
      const regionIndices: number[] = [];
      for (let t = 0; t < triangleSteps; t++) {
        regionIndices.push(triangleCount + t);
        triangleTextureIds.push(textureId);
        triangleSources.push({ brushId, surfaceIndex, textureId });
      }
      surfaceRegions.push({
        triangleIndices: regionIndices,
        textureId,
        brushId,
        surfaceIndex
      });
      triangleCount += triangleSteps;
      for (const localIndex of localIndices) {
        const vertex = polygon.vertices[localIndex];
        positionList.push(vertex.x, vertex.y, vertex.z);
        normalList.push(polygon.normal.x, polygon.normal.y, polygon.normal.z);
      }
    }
    return {
      positions: new Float32Array(positionList),
      normals: new Float32Array(normalList),
      triangleCount,
      triangleTextureIds,
      surfaceRegions,
      triangleSources
    };
  }
}
