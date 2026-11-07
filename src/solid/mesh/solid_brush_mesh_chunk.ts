import * as THREE from 'three';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import { FaceSurfaceDescription, createDefaultFaceSurface } from '@/texture/uv_matrix/face_surface_description.js';
import { SolidCompiledPolygon } from '@/solid/algorithm/compile/solid_compiled_polygon.js';
import { SurfaceTriangulator } from '@/solid/algorithm/surface/surface_triangulator.js';
import { shouldReverseSurfaceWinding } from '@/solid/types/surface_category.js';
import { SolidSurfaceRegion, SolidTriangleSource } from '@/solid/algorithm/surface/surface_triangulator.js';

/**
 * Pre-triangulated, UV-baked output for one brush. Reused across partial
 * updates so only brushes in the recompile set pay meshing cost.
 */
export interface SolidBrushMeshChunk {
  /** Interleaved XYZ positions (3 floats per vertex, 3 verts per triangle). */
  positions: Float32Array;
  /** Interleaved XYZ normals matching positions. */
  normals: Float32Array;
  /** Interleaved UV pairs matching positions. */
  uvs: Float32Array;
  /** Number of triangles in this chunk. */
  triangleCount: number;
  /** Number of vertices (triangleCount * 3). */
  vertexCount: number;
  /** Surface regions with triangle indices local to this chunk (0-based). */
  regions: SolidSurfaceRegion[];
  /** Per-triangle sources local to this chunk. */
  triangleSources: SolidTriangleSource[];
}

/** Options controlling how solid chunk UVs are projected. */
export interface SolidChunkUvBakeOptions {
  /**
   * Brush local → solid-model matrix. Used to convert model-space vertices into
   * brush-local space before applying the authored UV matrix.
   */
  brushModelMatrix?: THREE.Matrix4;
}

/** Builds and holds UV bake scratch state for chunk construction. */
export class SolidBrushMeshChunkBuilder {
  private readonly scratchPoint = new THREE.Vector3();
  private readonly scratchInverse = new THREE.Matrix4();

  /**
   * Triangulates polygons and bakes UV matrices into a reusable brush chunk.
   *
   * @param polygons Compiled polygons for one brush.
   * @param resolveSurface Maps surface index to authored face surface.
   * @param uvOptions Brush model matrix for local UV projection.
   * @returns Mesh chunk ready for assembly.
   */
  build(
    polygons: SolidCompiledPolygon[],
    resolveSurface: (surfaceIndex: number) => FaceSurfaceDescription,
    uvOptions: SolidChunkUvBakeOptions = {},
  ): SolidBrushMeshChunk {
    const vertexCount = this.countVertices(polygons);
    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    const regions: SolidSurfaceRegion[] = [];
    const triangleSources: SolidTriangleSource[] = [];
    let triangleCount = 0;
    let vertexWrite = 0;
    if (uvOptions.brushModelMatrix) {
      this.scratchInverse.copy(uvOptions.brushModelMatrix).invert();
    } else {
      this.scratchInverse.identity();
    }
    for (const polygon of polygons) {
      triangleCount = this.writePolygon(
        polygon,
        resolveSurface,
        positions,
        normals,
        uvs,
        regions,
        triangleSources,
        triangleCount,
        vertexWrite,
      );
      vertexWrite = triangleCount * 3;
    }
    return {
      positions,
      normals,
      uvs,
      triangleCount,
      vertexCount: triangleCount * 3,
      regions,
      triangleSources,
    };
  }

  /**
   * Counts non-indexed vertices produced by fan triangulation.
   *
   * @param polygons Input polygons.
   * @returns Vertex count.
   */
  private countVertices(polygons: SolidCompiledPolygon[]): number {
    let count = 0;
    for (const polygon of polygons) {
      const triangleCount = Math.max(0, polygon.vertices.length - 2);
      count += triangleCount * 3;
    }
    return count;
  }

  /**
   * Writes one polygon's triangles into the chunk buffers.
   *
   * @param polygon Source polygon.
   * @param resolveSurface Face surface resolver.
   * @param positions Position buffer.
   * @param normals Normal buffer.
   * @param uvs UV buffer.
   * @param regions Region accumulator.
   * @param triangleSources Source accumulator.
   * @param triangleCount Triangles written so far.
   * @param vertexWrite Next vertex index to write.
   * @returns Updated triangle count.
   */
  private writePolygon(
    polygon: SolidCompiledPolygon,
    resolveSurface: (surfaceIndex: number) => FaceSurfaceDescription,
    positions: Float32Array,
    normals: Float32Array,
    uvs: Float32Array,
    regions: SolidSurfaceRegion[],
    triangleSources: SolidTriangleSource[],
    triangleCount: number,
    vertexWrite: number,
  ): number {
    const fanIndices = SurfaceTriangulator.fanIndices(polygon.vertices.length);
    const triangleSteps = fanIndices.length / 3;
    if (triangleSteps < 1) return triangleCount;
    const surface = resolveSurface(polygon.surfaceIndex) ?? createDefaultFaceSurface();
    const textureId = polygon.textureId || surface.textureId || DEFAULT_CHECKER_TEXTURE_ID;
    const regionIndices: number[] = [];
    for (let step = 0; step < triangleSteps; step++) {
      regionIndices.push(triangleCount + step);
      triangleSources.push({
        brushId: polygon.brushId,
        surfaceIndex: polygon.surfaceIndex,
        textureId,
      });
      const base = step * 3;
      vertexWrite = this.writeTriangleCorners(
        polygon,
        fanIndices[base]!,
        fanIndices[base + 1]!,
        fanIndices[base + 2]!,
        surface,
        positions,
        normals,
        uvs,
        vertexWrite,
      );
    }
    regions.push({
      triangleIndices: regionIndices,
      textureId,
      brushId: polygon.brushId,
      surfaceIndex: polygon.surfaceIndex,
    });
    return triangleCount + triangleSteps;
  }

  /**
   * Writes one triangle's three corners into the buffers.
   *
   * @param polygon Source polygon.
   * @param indexA First local vertex index into the polygon.
   * @param indexB Second local vertex index into the polygon.
   * @param indexC Third local vertex index into the polygon.
   * @param surface Authored face surface.
   * @param positions Position buffer.
   * @param normals Normal buffer.
   * @param uvs UV buffer.
   * @param vertexWrite Next vertex index.
   * @returns Updated vertex write index.
   */
  private writeTriangleCorners(
    polygon: SolidCompiledPolygon,
    indexA: number,
    indexB: number,
    indexC: number,
    surface: FaceSurfaceDescription,
    positions: Float32Array,
    normals: Float32Array,
    uvs: Float32Array,
    vertexWrite: number,
  ): number {
    vertexWrite = this.writeOneCorner(polygon, indexA, surface, positions, normals, uvs, vertexWrite);
    vertexWrite = this.writeOneCorner(polygon, indexB, surface, positions, normals, uvs, vertexWrite);
    return this.writeOneCorner(polygon, indexC, surface, positions, normals, uvs, vertexWrite);
  }

  /**
   * Writes a single polygon corner into position, normal, and UV buffers.
   *
   * @param polygon Source polygon.
   * @param localIndex Local vertex index into the polygon.
   * @param surface Authored face surface.
   * @param positions Position buffer.
   * @param normals Normal buffer.
   * @param uvs UV buffer.
   * @param vertexWrite Next vertex index.
   * @returns Updated vertex write index.
   */
  private writeOneCorner(
    polygon: SolidCompiledPolygon,
    localIndex: number,
    surface: FaceSurfaceDescription,
    positions: Float32Array,
    normals: Float32Array,
    uvs: Float32Array,
    vertexWrite: number,
  ): number {
    const vertex = polygon.vertices[localIndex]!;
    const base = vertexWrite * 3;
    positions[base] = vertex.x;
    positions[base + 1] = vertex.y;
    positions[base + 2] = vertex.z;
    normals[base] = polygon.normal.x;
    normals[base + 1] = polygon.normal.y;
    normals[base + 2] = polygon.normal.z;
    this.projectVertexToUv(vertex, surface, uvs, vertexWrite, shouldReverseSurfaceWinding(polygon.category));
    return vertexWrite + 1;
  }

  /**
   * Projects one model-space vertex into the UV buffer using the brush-local UV
   * matrix.
   *
   * @param modelVertex Vertex in solid model space.
   * @param surface Authored face surface.
   * @param uvs UV buffer.
   * @param vertexWrite Vertex index to write.
   * @param isViewedFromReverseSide True when the polygon winding was reversed
   *   (cavity faces such as inverted-world or subtractive walls), which mirrors
   *   U so the texture reads the same way as on a front-facing surface while
   *   keeping tile seams at the same positions.
   */
  private projectVertexToUv(
    modelVertex: THREE.Vector3,
    surface: FaceSurfaceDescription,
    uvs: Float32Array,
    vertexWrite: number,
    isViewedFromReverseSide: boolean,
  ): void {
    this.scratchPoint.copy(modelVertex).applyMatrix4(this.scratchInverse);
    const coords = surface.uv.project(this.scratchPoint);
    const uvBase = vertexWrite * 2;
    uvs[uvBase] = isViewedFromReverseSide ? 1 - coords.u : coords.u;
    uvs[uvBase + 1] = coords.v;
  }
}
