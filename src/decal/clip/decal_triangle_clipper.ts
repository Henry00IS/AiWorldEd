import type * as THREE from 'three';
import { DecalClipPolygon } from './decal_clip_polygon.js';

/**
 * Cuts surface triangles to the unit box of a decal projector. Triangles are
 * moved into projector space, where the box spans -0.5 to 0.5 on every axis, so
 * each cut is a comparison against one coordinate.
 */
export class DecalTriangleClipper {
  private readonly polygon = new DecalClipPolygon();
  private readonly modelToProjector = new Float64Array(16);
  private readonly triangleCorners = new Float64Array(3 * DecalClipPolygon.floatsPerCorner);

  /**
   * Sets the transform from model space into projector space.
   *
   * @param matrix Model-to-projector matrix.
   */
  projectorSpaceSet(matrix: THREE.Matrix4): void {
    this.modelToProjector.set(matrix.elements);
  }

  /**
   * Returns the polygon produced by the last clip.
   *
   * @returns Clip polygon.
   */
  result(): DecalClipPolygon {
    return this.polygon;
  }

  /**
   * Cuts one triangle of a non-indexed triangle list to the projector box.
   *
   * @param positions Model-space positions, nine floats per triangle.
   * @param normals Model-space normals matching the positions.
   * @param triangle Triangle index.
   * @returns Corner count of the resulting polygon; zero when nothing is
   *   inside.
   */
  clipTriangle(positions: Float32Array, normals: Float32Array, triangle: number): number {
    this.cornersLoad(positions, normals, triangle);
    const outsideMask = this.outsideFaceMask();
    if (outsideMask < 0) return 0;
    this.polygon.reset();
    for (let corner = 0; corner < 3; corner++) {
      this.polygon.cornerAppend(this.triangleCorners, corner * DecalClipPolygon.floatsPerCorner);
    }
    this.polygonCutByFaces(outsideMask);
    return this.polygon.cornerCount() >= 3 ? this.polygon.cornerCount() : 0;
  }

  /**
   * Cuts the loaded polygon by every box face that one of its corners crosses.
   *
   * @param outsideMask Bit per face that at least one corner lies outside of.
   */
  private polygonCutByFaces(outsideMask: number): void {
    for (let face = 0; face < 6 && this.polygon.cornerCount() >= 3; face++) {
      if ((outsideMask & (1 << face)) === 0) continue;
      this.polygon.cutByBoxFace(face >> 1, (face & 1) === 0 ? 1 : -1);
    }
  }

  /**
   * Fills the triangle corner array with projector position, model position and
   * normal of each corner.
   *
   * @param positions Model-space positions.
   * @param normals Model-space normals.
   * @param triangle Triangle index.
   */
  private cornersLoad(positions: Float32Array, normals: Float32Array, triangle: number): void {
    for (let corner = 0; corner < 3; corner++) {
      const source = (triangle * 3 + corner) * 3;
      const target = corner * DecalClipPolygon.floatsPerCorner;
      const x = positions[source] ?? 0;
      const y = positions[source + 1] ?? 0;
      const z = positions[source + 2] ?? 0;
      this.projectorPointWrite(x, y, z, target);
      this.triangleCorners[target + 3] = x;
      this.triangleCorners[target + 4] = y;
      this.triangleCorners[target + 5] = z;
      this.triangleCorners[target + 6] = normals[source] ?? 0;
      this.triangleCorners[target + 7] = normals[source + 1] ?? 0;
      this.triangleCorners[target + 8] = normals[source + 2] ?? 0;
    }
  }

  /**
   * Writes the projector-space position of a model-space point.
   *
   * @param x Model x.
   * @param y Model y.
   * @param z Model z.
   * @param target Index of the first float to write in the corner array.
   */
  private projectorPointWrite(x: number, y: number, z: number, target: number): void {
    const m = this.modelToProjector;
    this.triangleCorners[target] = (m[0] ?? 0) * x + (m[4] ?? 0) * y + (m[8] ?? 0) * z + (m[12] ?? 0);
    this.triangleCorners[target + 1] = (m[1] ?? 0) * x + (m[5] ?? 0) * y + (m[9] ?? 0) * z + (m[13] ?? 0);
    this.triangleCorners[target + 2] = (m[2] ?? 0) * x + (m[6] ?? 0) * y + (m[10] ?? 0) * z + (m[14] ?? 0);
  }

  /**
   * Returns a bit per box face that some corner lies outside of, or -1 when all
   * three corners lie outside the same face.
   *
   * @returns Face mask, or -1 for a triangle that misses the box.
   */
  private outsideFaceMask(): number {
    let mask = 0;
    for (let face = 0; face < 6; face++) {
      const outsideCount = this.cornersOutsideFace(face >> 1, (face & 1) === 0 ? 1 : -1);
      if (outsideCount === 3) return -1;
      if (outsideCount > 0) mask |= 1 << face;
    }
    return mask;
  }

  /**
   * Counts the corners lying outside one box face.
   *
   * @param axis Projector axis index.
   * @param side Face side, 1 or -1.
   * @returns Number of corners outside, from 0 to 3.
   */
  private cornersOutsideFace(axis: number, side: number): number {
    let outside = 0;
    for (let corner = 0; corner < 3; corner++) {
      const coordinate = this.triangleCorners[corner * DecalClipPolygon.floatsPerCorner + axis] ?? 0;
      if (side * coordinate > 0.5) outside++;
    }
    return outside;
  }
}
