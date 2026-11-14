import * as THREE from 'three';
import type { SolidBrushMeshChunk } from '@/solid/mesh/solid_brush_mesh_chunk.js';
import { DecalClipPolygon } from '@/decal/clip/decal_clip_polygon.js';
import { DecalTriangleClipper } from '@/decal/clip/decal_triangle_clipper.js';
import type { DecalFragment } from './decal_fragment.js';
import { DecalFloatList } from './decal_float_list.js';

/** Projection a fragment is cut for. */
export interface DecalFragmentProjection {
  /** Model-to-projector transform. */
  modelToProjector: THREE.Matrix4;
  /** Unit model-space direction the image travels in. */
  travelDirection: THREE.Vector3;
  /**
   * Smallest cosine between a surface normal and the reversed travel direction
   * that still receives the image.
   */
  minimumFacingCosine: number;
}

/** Cuts the triangles of brush chunks into decal fragments. */
export class BuilderDecalFragment {
  private readonly clipper = new DecalTriangleClipper();
  private readonly positions = new DecalFloatList();
  private readonly normals = new DecalFloatList();
  private readonly uvs = new DecalFloatList();
  private readonly normalSum = new THREE.Vector3();
  private projection: DecalFragmentProjection | null = null;

  /**
   * Sets the projection used by the following builds.
   *
   * @param projection Projection of one decal.
   */
  projectionSet(projection: DecalFragmentProjection): void {
    this.projection = projection;
    this.clipper.projectorSpaceSet(projection.modelToProjector);
  }

  /**
   * Cuts every triangle of a chunk that faces the projector to its box.
   *
   * @param chunk Brush chunk in model space.
   * @returns Fragment, or null when no triangle reaches the image.
   */
  build(chunk: SolidBrushMeshChunk): DecalFragment | null {
    this.listsClear();
    for (let triangle = 0; triangle < chunk.triangleCount; triangle++) {
      if (!this.triangleFacesProjector(chunk.normals, triangle)) continue;
      const cornerCount = this.clipper.clipTriangle(chunk.positions, chunk.normals, triangle);
      if (cornerCount > 0) this.polygonEmit(cornerCount);
    }
    if (this.positions.length() === 0) return null;
    return {
      positions: this.positions.snapshot(),
      normals: this.normals.snapshot(),
      uvs: this.uvs.snapshot(),
      triangleCount: this.positions.length() / 9,
    };
  }

  /** Empties the output lists. */
  private listsClear(): void {
    this.positions.clear();
    this.normals.clear();
    this.uvs.clear();
  }

  /**
   * Returns whether a triangle's shading normal is turned toward the projector
   * within the allowed angle.
   *
   * @param normals Model-space normals, nine floats per triangle.
   * @param triangle Triangle index.
   * @returns True when the triangle may receive the image.
   */
  private triangleFacesProjector(normals: Float32Array, triangle: number): boolean {
    const projection = this.projection;
    if (!projection) return false;
    const base = triangle * 9;
    this.normalSum.set(
      (normals[base] ?? 0) + (normals[base + 3] ?? 0) + (normals[base + 6] ?? 0),
      (normals[base + 1] ?? 0) + (normals[base + 4] ?? 0) + (normals[base + 7] ?? 0),
      (normals[base + 2] ?? 0) + (normals[base + 5] ?? 0) + (normals[base + 8] ?? 0),
    );
    const length = this.normalSum.length();
    if (length === 0) return false;
    return -this.normalSum.dot(projection.travelDirection) / length >= projection.minimumFacingCosine;
  }

  /**
   * Writes the clipped convex polygon as a fan of triangles.
   *
   * @param cornerCount Corner count of the clipped polygon.
   */
  private polygonEmit(cornerCount: number): void {
    const corners = this.clipper.result().cornerData();
    for (let corner = 1; corner + 1 < cornerCount; corner++) {
      this.cornerEmit(corners, 0);
      this.cornerEmit(corners, corner);
      this.cornerEmit(corners, corner + 1);
    }
  }

  /**
   * Writes one corner's model position, unit normal and image coordinates.
   *
   * @param corners Clipped corner floats.
   * @param corner Corner index.
   */
  private cornerEmit(corners: Float64Array, corner: number): void {
    const offset = corner * DecalClipPolygon.floatsPerCorner;
    this.positions.pushTriple(corners[offset + 3] ?? 0, corners[offset + 4] ?? 0, corners[offset + 5] ?? 0);
    const normalX = corners[offset + 6] ?? 0;
    const normalY = corners[offset + 7] ?? 0;
    const normalZ = corners[offset + 8] ?? 0;
    const normalLength = Math.hypot(normalX, normalY, normalZ) || 1;
    this.normals.pushTriple(normalX / normalLength, normalY / normalLength, normalZ / normalLength);
    this.uvs.pushPair((corners[offset] ?? 0) + 0.5, 0.5 - (corners[offset + 2] ?? 0));
  }
}
