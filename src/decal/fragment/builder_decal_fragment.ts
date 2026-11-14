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
  /** True also records projector-space triangles for first-hit masking. */
  recordsShielding: boolean;
}

/** Cuts the triangles of brush chunks into decal fragments. */
export class BuilderDecalFragment {
  private readonly clipper = new DecalTriangleClipper();
  private readonly positions = new DecalFloatList();
  private readonly normals = new DecalFloatList();
  private readonly uvs = new DecalFloatList();
  private readonly projectorLocal = new DecalFloatList();
  private readonly shields = new DecalFloatList();
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
   * Cuts every triangle of a chunk that faces the projector to its box. When
   * shielding is recorded, triangles turned toward the projector too steeply to
   * receive the image are kept as shields.
   *
   * @param chunk Brush chunk in model space.
   * @returns Fragment, or null when no triangle reaches the box.
   */
  build(chunk: SolidBrushMeshChunk): DecalFragment | null {
    this.listsClear();
    const records = this.projection?.recordsShielding === true;
    for (let triangle = 0; triangle < chunk.triangleCount; triangle++) {
      const facing = this.triangleFacing(chunk.normals, triangle);
      const receives = facing >= (this.projection?.minimumFacingCosine ?? 1);
      if (!receives && !(records && facing > 0)) continue;
      const cornerCount = this.clipper.clipTriangle(chunk.positions, chunk.normals, triangle);
      if (cornerCount === 0) continue;
      if (receives) this.polygonEmit(cornerCount, records);
      else this.shieldEmit(cornerCount);
    }
    if (this.positions.length() === 0 && this.shields.length() === 0) return null;
    return {
      positions: this.positions.snapshot(),
      normals: this.normals.snapshot(),
      uvs: this.uvs.snapshot(),
      triangleCount: this.positions.length() / 9,
      projectorLocal: this.projectorLocal.snapshot(),
      shields: this.shields.snapshot(),
    };
  }

  /** Empties the output lists. */
  private listsClear(): void {
    this.positions.clear();
    this.normals.clear();
    this.uvs.clear();
    this.projectorLocal.clear();
    this.shields.clear();
  }

  /**
   * Writes a clipped polygon's projector-space fan as shield triangles.
   *
   * @param cornerCount Corner count of the clipped polygon.
   */
  private shieldEmit(cornerCount: number): void {
    const corners = this.clipper.result().cornerData();
    const stride = DecalClipPolygon.floatsPerCorner;
    for (let corner = 1; corner + 1 < cornerCount; corner++) {
      for (const index of [0, corner, corner + 1]) {
        const offset = index * stride;
        this.shields.pushTriple(corners[offset] ?? 0, corners[offset + 1] ?? 0, corners[offset + 2] ?? 0);
      }
    }
  }

  /**
   * Returns the cosine between a triangle's summed shading normal and the
   * reversed travel direction.
   *
   * @param normals Model-space normals, nine floats per triangle.
   * @param triangle Triangle index.
   * @returns Facing cosine; -1 without a projection or a normal.
   */
  private triangleFacing(normals: Float32Array, triangle: number): number {
    const projection = this.projection;
    if (!projection) return -1;
    const base = triangle * 9;
    this.normalSum.set(
      (normals[base] ?? 0) + (normals[base + 3] ?? 0) + (normals[base + 6] ?? 0),
      (normals[base + 1] ?? 0) + (normals[base + 4] ?? 0) + (normals[base + 7] ?? 0),
      (normals[base + 2] ?? 0) + (normals[base + 5] ?? 0) + (normals[base + 8] ?? 0),
    );
    const length = this.normalSum.length();
    if (length === 0) return -1;
    return -this.normalSum.dot(projection.travelDirection) / length;
  }

  /**
   * Writes the clipped convex polygon as a fan of triangles.
   *
   * @param cornerCount Corner count of the clipped polygon.
   * @param recordsLocal True also writes projector-space positions.
   */
  private polygonEmit(cornerCount: number, recordsLocal: boolean): void {
    const corners = this.clipper.result().cornerData();
    for (let corner = 1; corner + 1 < cornerCount; corner++) {
      for (const index of [0, corner, corner + 1]) {
        this.cornerEmit(corners, index);
        if (!recordsLocal) continue;
        const offset = index * DecalClipPolygon.floatsPerCorner;
        this.projectorLocal.pushTriple(corners[offset] ?? 0, corners[offset + 1] ?? 0, corners[offset + 2] ?? 0);
      }
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
