import * as THREE from 'three';
import { FaceTextureMapping, cloneFaceTextureMapping } from '@/texture/uv/face_texture_mapping.js';

/** Texture coordinate of one polygon corner. */
export type CsgCornerUv = readonly [number, number];

/**
 * A planar polygon defined by winding-order vertices and a supporting plane.
 * Optionally stores surface texture mapping and per-corner texture
 * coordinates.
 */
export class CsgPolygon {
  private vertices: THREE.Vector3[];
  private planeNormal: THREE.Vector3;
  private planeConstant: number;
  private surfaceMapping: FaceTextureMapping | null;
  private uvs: CsgCornerUv[] | null;

  /**
   * Creates a polygon from three or more vertices that share a plane.
   *
   * @param vertices The polygon vertices in winding order.
   * @param surfaceMapping Optional face texture mapping for this surface.
   * @param uvs Optional texture coordinate of each vertex, in the same order.
   */
  constructor(
    vertices: THREE.Vector3[],
    surfaceMapping: FaceTextureMapping | null = null,
    uvs: readonly CsgCornerUv[] | null = null,
  ) {
    this.vertices = vertices.map((vertex) => vertex.clone());
    this.uvs = uvs && uvs.length === vertices.length ? uvs.map(([u, v]) => [u, v] as const) : null;
    const plane = this.computePlaneFromVertices(this.vertices);
    this.planeNormal = plane.normal;
    this.planeConstant = plane.constant;
    this.surfaceMapping = surfaceMapping ? cloneFaceTextureMapping(surfaceMapping) : null;
  }

  /**
   * Returns a deep clone of this polygon including surface mapping.
   *
   * @returns A new CsgPolygon with copied vertices and mapping.
   */
  clone(): CsgPolygon {
    return new CsgPolygon(this.vertices, this.surfaceMapping, this.uvs);
  }

  /** Reverses vertex winding and negates the plane normal and constant. */
  flip(): void {
    this.vertices.reverse();
    this.uvs?.reverse();
    this.planeNormal.negate();
    this.planeConstant = -this.planeConstant;
  }

  /**
   * Returns the polygon vertices.
   *
   * @returns The vertex array.
   */
  getVertices(): THREE.Vector3[] {
    return this.vertices;
  }

  /**
   * Returns the texture coordinate of each vertex, if the polygon has them.
   *
   * @returns Coordinates in vertex order, or null.
   */
  getUvs(): readonly CsgCornerUv[] | null {
    return this.uvs;
  }

  /**
   * Whether the polygon encloses any area; pieces split off along an edge may
   * not.
   *
   * @returns True when it has an area.
   */
  hasArea(): boolean {
    return this.planeNormal.lengthSq() > 0.5;
  }

  /**
   * Returns the plane normal.
   *
   * @returns The unit normal vector.
   */
  getPlaneNormal(): THREE.Vector3 {
    return this.planeNormal;
  }

  /**
   * Returns the plane constant for the plane equation n·x = c.
   *
   * @returns The plane constant.
   */
  getPlaneConstant(): number {
    return this.planeConstant;
  }

  /**
   * Returns the surface texture mapping for this polygon, if any.
   *
   * @returns Mapping clone, or null when unset.
   */
  getSurfaceMapping(): FaceTextureMapping | null {
    return this.surfaceMapping ? cloneFaceTextureMapping(this.surfaceMapping) : null;
  }

  /**
   * Sets the surface texture mapping carried by this polygon.
   *
   * @param mapping Mapping to store, or null to clear.
   */
  setSurfaceMapping(mapping: FaceTextureMapping | null): void {
    this.surfaceMapping = mapping ? cloneFaceTextureMapping(mapping) : null;
  }

  /**
   * Builds a plane equation from every vertex (summing the cross products of
   * the edges), so it holds when the first corners lie on a line; a polygon
   * with no area gets a zero normal.
   *
   * @param vertices The polygon vertices.
   * @returns The plane normal and constant.
   */
  private computePlaneFromVertices(vertices: THREE.Vector3[]): {
    normal: THREE.Vector3;
    constant: number;
  } {
    const normal = new THREE.Vector3();
    const center = new THREE.Vector3();
    vertices.forEach((vertex, index) => {
      const next = vertices[(index + 1) % vertices.length] ?? vertex;
      normal.x += (vertex.y - next.y) * (vertex.z + next.z);
      normal.y += (vertex.z - next.z) * (vertex.x + next.x);
      normal.z += (vertex.x - next.x) * (vertex.y + next.y);
      center.add(vertex);
    });
    if (normal.lengthSq() < 1e-18) return { normal: new THREE.Vector3(), constant: 0 };
    normal.normalize();
    return { normal, constant: normal.dot(center.divideScalar(Math.max(1, vertices.length))) };
  }
}
